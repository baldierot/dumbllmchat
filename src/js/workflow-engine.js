import { WorkflowParser } from './workflow-parser.js';

const NodeStatus = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class WorkflowEngine {
    constructor(chatAPI) {
        this.chatAPI = chatAPI;
        this.parser = new WorkflowParser();
    }

    async execute(workflowScript, userInput, progressCallback = () => {}) {
        const nodes = this.parser.parse(workflowScript);
        if (!nodes || nodes.length === 0) {
            return "";
        }

        // --- Upfront Model Validation ---
        const availableModels = this.chatAPI.getModels().map(m => m.nickname.toLowerCase());
        const staticVars = new Map(nodes.filter(n => n.type === 'static').map(n => [n.id, n.prompt]));

        const requiredModels = new Set();
        nodes.filter(n => n.type === 'llm').forEach(n => {
            if (n.model) {
                requiredModels.add(n.model.toLowerCase());
            } else if (n.modelVariable) {
                const resolvedModel = staticVars.get(n.modelVariable);
                if (resolvedModel) {
                    requiredModels.add(resolvedModel.toLowerCase());
                } else {
                    // This case implies a dependency on a non-static node, which the engine will handle.
                    // Or it's a dependency on a missing node, which will be caught by the dependency checks.
                }
            }
        });
        
        const undefinedModels = [...requiredModels].filter(m => !availableModels.includes(m));
        if (undefinedModels.length > 0) {
            throw new Error(`Workflow aborted: The following models are not defined: ${undefinedModels.join(', ')}`);
        }
        // --- End Validation ---

        const nodeMap = new Map(nodes.map(node => [node.id, node]));
        const nodeStates = new Map(nodes.map(node => [node.id, NodeStatus.PENDING]));
        const outputs = new Map();

        let running = true;
        let lastRunnableCount = -1;
        let deadlockCounter = 0;

        while (running) {
            const runnableNodes = nodes.filter(node => {
                if (nodeStates.get(node.id) !== NodeStatus.PENDING) {
                    return false;
                }
                const implicitDeps = node.children || [];
                const explicitDeps = node.explicitDependencies || [];
                const allDeps = [...new Set([...implicitDeps, ...explicitDeps])];
                
                return allDeps.every(depId => nodeStates.get(depId) === NodeStatus.COMPLETED);
            });

            if (runnableNodes.length === 0) {
                const isStillPending = Array.from(nodeStates.values()).some(s => s === NodeStatus.PENDING || s === NodeStatus.RUNNING);
                if (isStillPending) {
                    if (runnableNodes.length === lastRunnableCount) {
                        deadlockCounter++;
                    } else {
                        deadlockCounter = 0;
                    }

                    if (deadlockCounter > 5) { // Wait a few ticks to be sure
                         throw new Error("Deadlock detected: No runnable nodes found, but some nodes are still pending.");
                    }
                } else {
                    running = false;
                    continue;
                }
            }
            lastRunnableCount = runnableNodes.length;


            // Filter nodes into static and LLM types
            const runnableLlmNodes = runnableNodes.filter(node => node.type === 'llm');
            const runnableStaticNodes = runnableNodes.filter(node => node.type === 'static');

            // Process static nodes in parallel
            const staticPromises = runnableStaticNodes.map(async node => {
                nodeStates.set(node.id, NodeStatus.RUNNING);
                progressCallback(`Resolving: ${node.id}`);
                try {
                    let content = node.prompt.replace(/\{\{INPUT\}\}/g, userInput);
                    // Explicit dependencies for static nodes
                    if (node.explicitDependencies) {
                        node.explicitDependencies.forEach(depId => {
                            const regex = new RegExp(`\\{\\{#${depId}\\}\\}`, 'g');
                            content = content.replace(regex, outputs.get(depId) || '');
                        });
                    }
                    outputs.set(node.id, content);
                    nodeStates.set(node.id, NodeStatus.COMPLETED);
                    progressCallback(`Completed: ${node.id}`);
                } catch (error) {
                    nodeStates.set(node.id, NodeStatus.FAILED);
                    progressCallback(`Failed: ${node.id} - ${error.message}`);
                    throw new Error(`Error resolving static node ${node.id}: ${error.message}`);
                }
            });
            await Promise.all(staticPromises);

            // Process LLM nodes based on the sequential setting
            if (this.chatAPI.sequentialWorkflowRequests) {
                // Sequential processing for LLM nodes
                for (let i = 0; i < runnableLlmNodes.length; i++) {
                    const node = runnableLlmNodes[i];
                    nodeStates.set(node.id, NodeStatus.RUNNING);

                    try {
                        let modelToUse = node.model;
                        if (node.modelVariable) {
                            modelToUse = outputs.get(node.modelVariable);
                            if (!modelToUse) {
                                throw new Error(`Could not resolve model variable "${node.modelVariable}"`);
                            }
                        }
                        
                        progressCallback(`Running: ${node.id} (${modelToUse})`);

                        // 1. Construct Prompt (same logic as before)
                        let prompt = node.prompt.replace(/\{\{INPUT\}\}/g, userInput);
                        const promptDeps = new Set();

                        if (node.explicitDependencies) {
                            node.explicitDependencies.forEach(depId => {
                                const regex = new RegExp(`\\{\\{#${depId}\\}\\}`, 'g');
                                prompt = prompt.replace(regex, outputs.get(depId));
                                promptDeps.add(depId);
                            });
                        }

                        const implicitDepsToPrepend = (node.children || [])
                            .filter(childId => !promptDeps.has(childId))
                            .map(childId => outputs.get(childId))
                            .join('\n\n');
                        
                        if (implicitDepsToPrepend) {
                            prompt = `${implicitDepsToPrepend}\n\n${prompt}`;
                        }
                        
                        // 2. Construct Messages (same logic as before)
                        let messages = [];
                        const useHistory = node.flags && node.flags.includes('history');
                        
                        if (useHistory) {
                            messages = await this.chatAPI.getMessages() || [];
                            messages.push({ sender: 'User', content: prompt });
                        } else {
                            messages = [{ sender: 'User', content: prompt }];
                        }

                        // Apply delay before making API call, but skip for the very first LLM node in the batch
                        if (this.chatAPI.workflowRequestDelay > 0 && i > 0) {
                            progressCallback(`Waiting for ${this.chatAPI.workflowRequestDelay} seconds...`);
                            await sleep(this.chatAPI.workflowRequestDelay * 1000);
                        }

                        // 3. Call API (same logic as before)
                        const result = await this.chatAPI.generateFromModel(modelToUse, messages, node.flags);
                        outputs.set(node.id, result);
                        nodeStates.set(node.id, NodeStatus.COMPLETED);
                        progressCallback(`Completed: ${node.id}`);

                    } catch (error) {
                        nodeStates.set(node.id, NodeStatus.FAILED);
                        progressCallback(`Failed: ${node.id} - ${error.message}`);
                        throw new Error(`Error executing node ${node.id}: ${error.message}`);
                    }
                }
            } else {
                // Parallel processing for LLM nodes (original behavior with pre-call delay)
                const llmPromises = runnableLlmNodes.map(async node => {
                    nodeStates.set(node.id, NodeStatus.RUNNING);
                    try {
                        let modelToUse = node.model;
                        if (node.modelVariable) {
                            modelToUse = outputs.get(node.modelVariable);
                            if (!modelToUse) {
                                throw new Error(`Could not resolve model variable "${node.modelVariable}"`);
                            }
                        }
                        
                        progressCallback(`Running: ${node.id} (${modelToUse})`);

                        // 1. Construct Prompt
                        let prompt = node.prompt.replace(/\{\{INPUT\}\}/g, userInput);
                        const promptDeps = new Set();

                        if (node.explicitDependencies) {
                            node.explicitDependencies.forEach(depId => {
                                const regex = new RegExp(`\\{\\{#${depId}\\}\\}`, 'g');
                                prompt = prompt.replace(regex, outputs.get(depId));
                                promptDeps.add(depId);
                            });
                        }

                        const implicitDepsToPrepend = (node.children || [])
                            .filter(childId => !promptDeps.has(childId))
                            .map(childId => outputs.get(childId))
                            .join('\n\n');
                        
                        if (implicitDepsToPrepend) {
                            prompt = `${implicitDepsToPrepend}\n\n${prompt}`;
                        }
                        
                        // 2. Construct Messages
                        let messages = [];
                        const useHistory = node.flags && node.flags.includes('history');
                        
                        if (useHistory) {
                            messages = await this.chatAPI.getMessages() || [];
                            messages.push({ sender: 'User', content: prompt });
                        } else {
                            messages = [{ sender: 'User', content: prompt }];
                        }

                        // Apply delay before making API call for LLM nodes in parallel mode
                        if (this.chatAPI.workflowRequestDelay > 0) {
                            progressCallback(`Waiting for ${this.chatAPI.workflowRequestDelay} seconds before ${node.id}...`);
                            await sleep(this.chatAPI.workflowRequestDelay * 1000);
                        }

                        // 3. Call API
                        const result = await this.chatAPI.generateFromModel(modelToUse, messages, node.flags);
                        outputs.set(node.id, result);
                        nodeStates.set(node.id, NodeStatus.COMPLETED);
                        progressCallback(`Completed: ${node.id}`);

                    } catch (error) {
                        nodeStates.set(node.id, NodeStatus.FAILED);
                        progressCallback(`Failed: ${node.id} - ${error.message}`);
                        throw new Error(`Error executing node ${node.id}: ${error.message}`);
                    }
                });
                await Promise.all(llmPromises);
            }
            
            // Small delay to prevent tight loops in case of issues
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 4. Final Output
        const rootNodes = nodes.filter(node => node.indentLevel === 0 && node.type === 'llm');
        return rootNodes
            .map(node => outputs.get(node.id))
            .join('\n\n');
    }
}
