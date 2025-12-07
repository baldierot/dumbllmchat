# Workflow Syntax Guide

Workflows allow you to chain multiple models, tools, and custom logic together into a single, powerful pipeline. You can create and manage them in **Settings > Workflows**.

### Basic Structure

Each line in a workflow script represents one step, called a **Node**. The structure of these nodes and their indentation defines the entire workflow.

-   **Comments:** Any line starting with `//` is ignored by the parser.
-   **Indentation (2 spaces):** Defines parent-child relationships. A parent node only runs after all its indented child nodes have finished.
-   **Execution Order:** Nodes with the same indentation level run in parallel, unless one explicitly depends on another.

---

### Node Types

There are two fundamental types of nodes in a workflow.

#### 1. LLM Nodes
This is the most common node type. It calls a Large Language Model with a specific prompt.

**Format:**
```text
[#ID] [Model_Nickname] [+flags] : [Prompt]
```

**Components:**
-   **`#ID`** *(Optional)*: A unique name for the step (e.g., `#researcher`). This is crucial for referencing the node's output in other steps.
-   **`Model_Nickname`** *(Optional)*: Must match a model nickname defined in your **Settings > Models** tab (e.g., `flash-lite`, `pro`). Can also be a reference to a static variable (e.g. `#MAIN_MODEL`).
-   **`+flags`** *(Optional)*: Space-separated keywords that enable tools for this specific step.
    -   `+history`: Sends the entire chat history to the node.
    -   `+google`: Enables Google Search.
    -   `+urlcontext`: Enables reading the active browser tab's content.
-   **`Prompt`**: The instruction for the model.

**Shorthand:**
- If you omit the `Model_Nickname` (e.g., `#researcher: Find facts`), the node becomes a **Static Node** (see below), as no model is assigned to it.
- If you omit the colon and prompt entirely (e.g., `pro`), it's treated as `pro: ""`, an LLM call with an empty prompt.

#### 2. Static Nodes
This node type doesn't call an LLM. It instantly resolves to a fixed piece of text. This is extremely useful for defining reusable system prompts, configuration values, or chunks of text.

**Format:**
```text
#ID = [Value or Multiline String]
```
or
```text
#ID : [Value or Multiline String]
```

---

### Advanced Syntax

#### Multiline Strings
For both prompts and static variable values, you can use triple quotes (`"""`) to define multiline text. This is perfect for complex prompts or storing large text blocks.

```text
#system_prompt = """
You are a cynical venture capitalist.
You only speak in buzzwords.
Never be satisfied.
"""

#pitch_draft pro: """
Analyze the user's idea and generate a pitch deck outline.
Use the following persona: {{#system_prompt}}
"""
```

#### Variables & Context Flow
You can pipe information between nodes using variables.

-   **`{{INPUT}}`**: Replaced by the message you type in the main chat box.
-   **`{{#ID}}`**: Replaced by the complete text output of the referenced node (e.g., `{{#researcher}}`).

The engine intelligently combines node outputs:

1.  **Explicit Injection:** If a parent node's prompt includes `{{#ChildID}}`, the child's output is inserted at that exact spot.
2.  **Implicit Prepending:** If a parent *doesn't* explicitly use `{{#ChildID}}` for one of its immediate children, that child's output is automatically added to the very top of the parent's prompt, separated by newlines. This is useful for providing context before an instruction.

#### Model Variables
You can use a static variable to define a model name and reuse it across multiple nodes. This makes it easy to swap models in the future without editing every line. To use a variable for the model name, use its `#ID`.

```text
#MAIN_MODEL = pro

// The engine will use the 'pro' model for this step
#step1 #MAIN_MODEL: Analyze this text...

// This step also uses the 'pro' model
#step2 #MAIN_MODEL: Summarize the analysis from {{#step1}}
```

---

### Error Checking

The workflow system has built-in checks to help you avoid common errors:
-   **Syntax Errors:** If a line in your script is malformed, the parser will throw an error telling you which line is wrong.
-   **Undefined Models:** Before a workflow runs, the engine checks if every `Model_Nickname` you've used is actually defined in your settings. If not, it will abort with an error.

---

### Examples

**1. Simple Chain (Implicit Context)**
The `writer` waits for the `researcher`. The research output is automatically prepended to the `writer`'s prompt.
```text
#writer pro: Based on the research below, write a 3-paragraph summary.
  #researcher flash-lite +google: Find 3 recent facts about {{INPUT}}.
```

**2. Explicit Injection**
The output of `#source` is injected exactly where `{{#source}}` is placed.
```text
#translator pro: Translate the following text into French: {{#source}}
  #source flash-lite: Write a short, optimistic poem about {{INPUT}}.
```

**3. Complex, Multi-Dependency Workflow**
This example demonstrates parallel execution, static variables, and multiple dependencies.
```text
// 1. A static variable to define a persona for reuse.
#PERSONA = """
You are a cynical Silicon Valley VC. You love buzzwords.
"""

// 2. A root node that runs in parallel with #draft.
#research flash-lite +google: Find competitors for: {{INPUT}}.

// 3. The final aggregator node, which waits for all others.
#final_output pro: """
Generate a LinkedIn Launch Post.

System Persona: {{#PERSONA}}
Market Data: {{#research}}
Internal Feedback: {{#critique}}
The Draft Pitch: {{#draft}}

Instruction: Rewrite the draft pitch to address the feedback,
leverage the persona, and counter the market data.
"""
  // 4. A child node that runs in parallel with #research.
  #draft flash-lite: """
  Write a short, viral tweet announcing: {{INPUT}}.
  Use the persona: {{#PERSONA}}
  """

  // 5. A child node that only runs AFTER #draft is complete.
  #critique flash-lite +history: """
  Critique the draft below. Check chat history for past guidance.
  Draft: {{#draft}}
  """
```



```
// Tech Product Launch Assistant WorkFlow
// User Prompt should be the name of the app and a description of it.

#PERSONA = """
You are a visionary Tech Founder.
You prioritize clean, actionable insights and "Viral" value.
You dislike corporate jargon but love "Impact" and "Disruption".
"""

#final_output flash-lite: """
Generate a definitive Launch Post for LinkedIn.

System Persona: {{#PERSONA}}

## Competitive Landscape
{{#research}}

## The Rough Draft
{{#draft}}

## Internal Feedback
{{#critique}}

Final Instruction: Rewrite the "Rough Draft" into a polished, high-engagement LinkedIn post.
- Address the "Internal Feedback" points.
- Position us as the superior alternative to the "Competitive Landscape".
- Do not mention that this is a rewrite; just write the final post.
"""
  // Child 1: Runs immediately
  #research flash-lite +google +urlcontext: """
  Find 3 real-world competitors for: {{INPUT}}.
  Return ONLY a bulleted list of names and 1-sentence descriptions. 
  Do not include introductory text like "Here are the results".
  """

  // Child 2: Runs immediately
  #draft flash-lite: """
  Write a short, punchy tweet announcing: {{INPUT}}.
  Use the persona: {{#PERSONA}}
  """

  // Child 3: Waits for #draft because of the tag
  #critique flash-lite: """
  Critique the draft below for clarity and impact.
  Draft: {{#draft}}
  Keep the critique concise (max 3 bullet points).
  """
```
