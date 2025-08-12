
class Header {
    constructor() {
        this.cycleModelBtn = document.getElementById('cycle-model-btn');
        this.modelNickname = document.getElementById('model-nickname');
        this.settingsBtn = document.getElementById('settings-btn');
        this.clearChatBtn = document.getElementById('clear-chat-btn');
        this.copyChatBtn = document.getElementById('copy-chat-btn');

        this.cycleModelBtn.addEventListener('click', () => window.chatStore.cycleModel());
        this.settingsBtn.addEventListener('click', () => window.eventManager.publish('openSettings'));
        this.clearChatBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the chat?')) {
                window.chatStore.clearMessages();
            }
        });
        this.copyChatBtn.addEventListener('click', () => {
            const messages = window.chatStore.getMessages();
            const chatText = messages.map(msg => `${msg.sender}: ${msg.content}`).join('\n\n');
            navigator.clipboard.writeText(chatText).then(() => {
                alert('Chat copied to clipboard!');
            }, () => {
                alert('Failed to copy chat.');
            });
        });

        window.eventManager.subscribe('modelChanged', (model) => this.updateModelNickname(model));
    }

    updateModelNickname(model) {
        this.modelNickname.textContent = model.nickname;
    }

    init() {
        const currentModel = window.chatStore.getCurrentModel();
        if (currentModel) {
            this.updateModelNickname(currentModel);
        }
    }
}
