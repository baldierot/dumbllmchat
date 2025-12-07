# Dumb LLM Chat

Dumb LLM Chat is a client-side web interface for Google's Gemini models. It runs entirely in the browser, storing all conversations and settings locally via IndexedDB. 

## Key Features

*   **100% Local:** Data and API keys remain in your browser; only calls to the Gemini API leave your machine.
*   **Workflow DSL:** Chain model calls, run steps in parallel, and use static variables to create multi-step logic pipelines.
*   **Model Management:** Configure and switch between multiple model presets (system prompts, temperature, tools).
*   **History & Files:** Full conversation management and file attachment support.
*   **PWA Support:** Installable as a native desktop or mobile application.

## Workflow System

Workflows allow you to chain steps to perform complex tasks. See [**usage.md**](./usage.md) for full documentation.

**Example:**
```text
// Researches a topic (using Google Search tool) then summarizes the findings.
#summary pro: Summarize the research below into three paragraphs.
  #research flash-lite +google: Find 5 recent facts about {{INPUT}}.
```

## Local Development

**Prerequisites:** Node.js (v18+)

1.  **Install:**
    ```sh
    git clone <repository-url>
    cd dumbllmchat
    npm install
    ```
2.  **Run:**
    ```sh
    npm run dev  # Starts dev server at http://localhost:5173
    npm run build # Builds for production
    ```

## Configuration

1.  Open the app and click **Settings** (⚙️).
2.  Under **Global**, enter your Google AI Studio API key.
3.  (Optional) Configure model presets in the **Models** tab.
4.  Save and start chatting.