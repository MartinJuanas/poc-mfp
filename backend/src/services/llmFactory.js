import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI, AzureChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import dotenv from "dotenv";

dotenv.config();

/**
 * Returns a configured LangChain Chat Model based on environment variables.
 *
 * Supported providers:
 * - google
 * - openai
 * - azure_openai
 * - ollama
 */
export function getLLM() {
  const provider = (process.env.LLM_PROVIDER || "google").toLowerCase();

  const modelName =
    process.env.LLM_MODEL || ({ google: "gemini-2.5-flash", openai: "gpt-4o-mini", ollama: "llama3.2" }[provider]);

  const parsedTemperature = Number.parseFloat(
    process.env.LLM_TEMPERATURE ?? "0",
  );

  const temperature = Number.isFinite(parsedTemperature)
    ? parsedTemperature
    : 0;

  console.log(
    `Initializing LLM Provider: ${provider}, Model: ${modelName}`,
  );

  switch (provider) {
    /*
     * Google Gemini
     */
    case "google": {
      const apiKey =
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_API_KEY;

      if (
        !apiKey ||
        apiKey.trim() === "" ||
        apiKey.includes("tu_api_key")
      ) {
        throw new Error(
          "GOOGLE_API_KEY o GEMINI_API_KEY no está configurada correctamente en backend/.env",
        );
      }

      return new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: apiKey.trim(),
        temperature,
      });
    }

    /*
     * OpenAI
     */
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey || apiKey.trim() === "") {
        throw new Error(
          "OPENAI_API_KEY no está configurada correctamente en backend/.env",
        );
      }

      return new ChatOpenAI({
        model: modelName,
        apiKey: apiKey.trim(),
        temperature,
      });
    }

    /*
     * Azure OpenAI
     */
    case "azure_openai": {
      const apiKey = process.env.AZURE_OPENAI_API_KEY;

      if (!apiKey || apiKey.trim() === "") {
        throw new Error(
          "AZURE_OPENAI_API_KEY no está configurada correctamente en backend/.env",
        );
      }

      return new AzureChatOpenAI({
        azureOpenAIApiKey: apiKey.trim(),
        azureOpenAIApiInstanceName:
          process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiDeploymentName:
          process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion:
          process.env.AZURE_OPENAI_API_VERSION,
        temperature,
      });
    }

    /*
     * Ollama
     */
    case "ollama": {
      return new ChatOllama({
        baseUrl:
          process.env.OLLAMA_BASE_URL ||
          "http://localhost:11434",
        model: modelName,
        temperature,
      });
    }

    /*
     * Unsupported provider
     */
    default: {
      throw new Error(
        `LLM_PROVIDER no soportado: "${provider}". ` +
        "Valores válidos: google, openai, azure_openai, ollama.",
      );
    }
  }
}
