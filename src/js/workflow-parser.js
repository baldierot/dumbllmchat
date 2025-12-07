export class WorkflowParser {

    parse(scriptText) {
        const lines = scriptText.split('\n');
        const nodes = [];
        const parentStack = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '' || line.trim().startsWith('//')) {
                continue;
            }

            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';
            const indentLevel = this.calculateIndentLevel(indent);

            let node = this.parseLine(line.trim(), indentLevel);
            if (!node) {
                throw new SyntaxError(`Invalid syntax on line ${i + 1}: "${line.trim()}"`);
            }

            if (node.prompt.trim() === '"""') {
                let multilineContent = '';
                i++;
                while (i < lines.length) {
                    const nextLine = lines[i];
                    if (nextLine.trim().endsWith('"""')) {
                        multilineContent += nextLine.trim().slice(0, -3);
                        break;
                    }
                    multilineContent += nextLine + '\n';
                    i++;
                }
                node.prompt = multilineContent.trim();
            }

            node.id = node.id || `node_${Date.now()}_${i}`;
            node.children = node.children || [];
            node.explicitDependencies = node.explicitDependencies || [];
            node.flags = node.flags || [];

            while (parentStack.length > 0 && parentStack[parentStack.length - 1].indentLevel >= node.indentLevel) {
                parentStack.pop();
            }
            if (parentStack.length > 0) {
                parentStack[parentStack.length - 1].children.push(node.id);
            }
            parentStack.push(node);
            nodes.push(node);
        }

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        nodes.forEach(node => {
            const depRegex = /\{\{#(\w+)\}\}/g;
            let match;
            if (node.prompt) {
                while ((match = depRegex.exec(node.prompt)) !== null) {
                    if (nodeMap.has(match[1])) {
                        node.explicitDependencies.push(match[1]);
                    }
                }
            }
        });

        return nodes;
    }

    calculateIndentLevel(indentString) {
        const spaces = indentString.replace(/\t/g, '  ').length;
        return Math.floor(spaces / 2);
    }

    parseLine(line, indentLevel) {
        const staticMatch = line.match(/^(#[\w-]+)\s*=\s*(.*)/);
        if (staticMatch) {
            const [, id, content] = staticMatch;
            return { id: id.substring(1), type: 'static', prompt: content.trim(), indentLevel, flags: [] };
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            const parts = line.split(/\s+/).filter(Boolean);
            let id = null, model = null, flags = [];
            let partIndex = 0;
            if (parts[partIndex]?.startsWith('#')) {
                id = parts[partIndex].substring(1);
                partIndex++;
            }
            if(partIndex < parts.length && !parts[partIndex].startsWith('+')) {
                model = parts[partIndex];
                partIndex++;
            }
             while (partIndex < parts.length) {
                if (parts[partIndex].startsWith('+')) {
                    flags.push(parts[partIndex].substring(1));
                }
                partIndex++;
            }
            return (id || model) ? { id, model, type: 'llm', prompt: "", indentLevel, flags } : null;
        }

        const before = line.substring(0, colonIndex).trim();
        const prompt = line.substring(colonIndex + 1).trim();
        const parts = before.split(/\s+/).filter(Boolean);
        
        let id = null, model = null, flags = [], partIndex = 0;
        
        if (parts[partIndex]?.startsWith('#')) {
            id = parts[partIndex].substring(1);
            partIndex++;
        }
        if (partIndex < parts.length && !parts[partIndex].startsWith('+')) {
            model = parts[partIndex];
            partIndex++;
        }
        while (partIndex < parts.length) {
            if (parts[partIndex].startsWith('+')) {
                flags.push(parts[partIndex].substring(1));
            }
            partIndex++;
        }

        if (!id && !model) return null;

        const type = model ? 'llm' : 'static';
        return { id, model, type, prompt, indentLevel, flags };
    }
}
