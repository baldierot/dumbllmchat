import { WorkflowParser } from './workflow-parser.js';

const NodeStatus = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

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
        const requiredModels = new Set(
            nodes.filter(n => n.type === 'llm' && n.model).map(n => n.model.toLowerCase())
        );
        
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


            const promises = runnableNodes.map(async node => {
                nodeStates.set(node.id, NodeStatus.RUNNING);
                
                if (node.type === 'static') {
                    progressCallback(`Resolving: ${node.id}`);
                    try {
                        // Process dependencies/variables in static content
                        let content = node.prompt.replace(/\{\{INPUT\}\}/g, userInput);
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
                } else {
                    // LLM Node
                    progressCallback(`Running: ${node.id} (${node.model})`);
                    try {
                        // 1. Construct Prompt
                        let prompt = node.prompt.replace(/\{\{INPUT\}\}/g, userInput);
                        const promptDeps = new Set();

                        // Explicit dependencies
                        if (node.explicitDependencies) {
                            node.explicitDependencies.forEach(depId => {
                                const regex = new RegExp(`\\{\\{#${depId}\\}\\}`, 'g');
                                prompt = prompt.replace(regex, outputs.get(depId));
                                promptDeps.add(depId);
                            });
                        }

                        // Implicit dependencies (prepend)
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

                        // 3. Call API
                        const result = await this.chatAPI.generateFromModel(node.model, messages, node.flags);
                        outputs.set(node.id, result);
                        nodeStates.set(node.id, NodeStatus.COMPLETED);
                        progressCallback(`Completed: ${node.id}`);

                    } catch (error) {
                        nodeStates.set(node.id, NodeStatus.FAILED);
                        progressCallback(`Failed: ${node.id} - ${error.message}`);
                        throw new Error(`Error executing node ${node.id}: ${error.message}`);
                    }
                }
            });

            await Promise.all(promises);
            
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
