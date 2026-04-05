import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedScenario } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateExperienceFromText = async (prompt: string, nodeCount: number): Promise<GeneratedScenario | null> => {
  try {
    const modelId = 'gemini-3-flash-preview';
    
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `
        I am designing an architectural path with ${nodeCount} key moments. 
        The user describes the journey as: "${prompt}".
        
        Based on this description, generate a sequence of ${nodeCount} intensity values (0 to 100) representing the emotional or spatial intensity of the experience at each step. 
        0 is neutral/boring, 100 is overwhelming/sublime.
        Provide a short 2-3 word label for each step.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  intensity: { type: Type.NUMBER },
                },
                required: ["description", "intensity"],
              },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as GeneratedScenario;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return null;
  }
};