
import { GoogleGenAI, Type } from "@google/genai";
import { DeckButtonConfig } from "../types";

export const generateButtonConfig = async (description: string): Promise<Partial<DeckButtonConfig>> => {
  // Always use this pattern for initialization as per guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const availableIcons = [
    'monitor', 'mic', 'mic-off', 'camera', 'message-square', 
    'clock', 'power', 'zap', 'wifi', 'radio', 'command', 
    'smartphone', 'activity', 'volume', 'video'
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Create a button configuration for a stream deck based on this description: "${description}".
    Available icons: ${availableIcons.join(', ')}.
    Colors should be valid Tailwind CSS background classes (e.g., bg-red-600, bg-blue-500, bg-emerald-600).
    Payload should be a relevant JSON action string.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          iconName: { type: Type.STRING },
          color: { type: Type.STRING },
          payload: { type: Type.STRING }
        },
        required: ["label", "iconName", "color", "payload"]
      }
    }
  });

  // response.text is a property getter, not a method.
  const generatedText = response.text;
  if (generatedText) {
    try {
      return JSON.parse(generatedText);
    } catch (e) {
      console.error("Failed to parse AI generated JSON", e);
      throw new Error("Could not parse generated button configuration");
    }
  }
  
  throw new Error("Failed to generate config from model");
};
