import { GoogleGenAI, Type, Part } from "@google/genai";
import { GeneratedFile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const model = 'gemini-2.5-flash';

const schema = {
  type: Type.OBJECT,
  properties: {
    files: {
      type: Type.ARRAY,
      description: "The complete and updated array of all file objects for the project. If modifying, return all files, not just the changed ones.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "The full file path, including any subdirectories (e.g., 'src/index.js', 'package.json')."
          },
          content: {
            type: Type.STRING,
            description: "The complete code or text content of the file."
          }
        },
        required: ["name", "content"]
      }
    }
  },
  required: ["files"]
};

export const generateScriptBundle = async (prompt: string, existingFiles: GeneratedFile[], imageBase64?: string): Promise<GeneratedFile[]> => {
    const systemInstruction = `You are a Staff-level Engineering Co-pilot, a world-class expert in software architecture, design patterns, and code generation. Your primary goal is to generate and iteratively refine complete, production-grade project scaffolds that are scalable, maintainable, and robust.

**ARCHITECTURAL PHILOSOPHY (NEW & CRITICAL):**

1.  **Modularity First:** For any non-trivial request, you MUST break the application into logical modules and components. Do not put all logic in a single file. For a web server, this means separate files for routes, controllers, services, and configuration. For a bot, separate command handlers from the main client logic.
2.  **Scalability:** Think ahead. Assume the user's project will grow. Use environment variables for configuration from the start ('.env.example'). Structure the code so that adding new features (e.g., new API endpoints, new bot commands) is intuitive and requires minimal refactoring.
3.  **Maintainability:** Generate clean, readable, and well-documented code. Use clear variable names and add comments for complex logic. The generated 'README.md' must be comprehensive.

**CORE DIRECTIVES:**

1.  **Iterative Development:** You will receive the current set of project files and a new prompt. Your task is to MODIFY the existing files or ADD new ones to meet the new request. Always return the COMPLETE, updated project structure.
2.  **Superior Dependency Selection:** Act as if you have real-time access to NPM, GitHub, and other package repositories. You MUST select modern, robust, and **highly compatible** dependencies. Prioritize mainstream libraries with strong community support. For example, for a Node.js web server, prefer Express or Fastify. For a Discord bot, use discord.js. This is your most important task.
3.  **Modern Standards:**
    *   For JavaScript/TypeScript, you MUST use the specified Module System. Default to **ES Modules (ESM)** if not specified. This means using '"type": "module"' in 'package.json' and 'import/export' syntax.
    *   Code must be clean, executable, and production-ready. **NO placeholder logic, TODOs, or commented-out code blocks.**
4.  **Image-Based Debugging:** If the user provides an image, it is almost certainly a **screenshot of an error**.
    *   Analyze the error message in the image (stack trace, compiler error, etc.).
    *   Cross-reference the error with the relevant code in the provided 'existingFiles'.
    *   Deduce the root cause and FIX the code directly. Your response MUST be the updated set of files with the fix applied.
5.  **Full Database Integration:** If a database is requested, you must fully integrate it: include the correct driver, generate configuration files that use environment variables, provide a complete '.env.example', and include clear example connection and query logic in the main script.
6.  **Mandatory Files (for Node.js):**
    *   **'package.json'**: Must be valid JSON with name, version, type, main, scripts, and all necessary dependencies.
    *   **Main script (e.g., 'src/index.js')**: The entry point.
    *   **'README.md'**: Clear, step-by-step setup and run instructions.
    *   **'.gitignore'**: Standard ignores ('node_modules', '.env', etc.).

**INPUT FORMAT:**

You will receive a JSON object containing 'existingFiles' and the user's 'prompt'.

**YOUR RESPONSE MUST BE a JSON object matching the required schema, containing the full, updated list of project files.**`;
    
    const inputPayload = {
        prompt,
        existingFiles
    };

    const contents: Part[] = [
      { text: `Here is the current state and the user's request. Your task is to return the new, complete state of the project files based on your core directives.\n\n${JSON.stringify(inputPayload)}` }
    ];

    if (imageBase64) {
      contents.push({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3, // Increased for more intelligent, creative solutions
      }
    });
    
    const jsonString = response.text.trim();
    if (!jsonString) {
      throw new Error("API returned an empty response. Please try rephrasing your request.");
    }

    try {
        const parsed = JSON.parse(jsonString) as { files: GeneratedFile[] };
        if (!parsed.files || !Array.isArray(parsed.files)) {
          throw new Error("API did not return the expected file structure.");
        }
        return parsed.files;
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonString);
        throw new Error("The API returned an invalid format. This might be due to a complex or unsupported request.");
    }
};