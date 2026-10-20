
import OpenAI from "openai";
import dotenv from "dotenv";
import { StitchToolClient } from "@google/stitch-sdk";

dotenv.config();

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY
});

const modelo = process.env.OPENROUTER_MODEL || "openrouter/free";

const stitchClient = new StitchToolClient({
    apiKey: process.env.STITCH_API_KEY
});

const systemPrompt = `
Eres un Ingeniero Frontend y Experto en UX/UI.
Tu objetivo es traducir los requerimientos del usuario en interfaces funcionales
usando las herramientas de Stitch.

Reglas:
1. Analiza el requerimiento y decide qué herramientas usar.
2. Si una herramienta falla, lee el error y ajusta los parámetros.
3. Informa al usuario de tus acciones de forma concisa.
`;

const userPrompt = `
Crea un proyecto nuevo y genera una pantalla de inicio de sesión
con un botón azul oscuro, campos para usuario y contraseña,
y las opciones de registrarse, olvidé mi contraseña y recordar sesión.
`;

async function iniciarAgente() {
    try {
        if (!process.env.OPENROUTER_API_KEY ||
            !process.env.STITCH_API_KEY) {
            throw new Error(
                "Configura OPENROUTER_API_KEY y STITCH_API_KEY en .env"
            );
        }

        console.log("Conectando con Stitch...");

        const { tools } = await stitchClient.listTools();

        const openRouterTools = tools.map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description || "",
                parameters: tool.inputSchema
            }
        }));

        console.log(
            `Conexión exitosa. ${tools.length} herramientas disponibles.`
        );

        const mensajes = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        let tareaCompletada = false;

        while (!tareaCompletada) {
            const respuesta = await openai.chat.completions.create({
                model: modelo,
                messages: mensajes,
                tools: openRouterTools,
                tool_choice: "auto"
            });

            const mensajeModelo = respuesta.choices[0].message;
            mensajes.push(mensajeModelo);

            if (mensajeModelo.tool_calls?.length) {
                for (const toolCall of mensajeModelo.tool_calls) {
                    console.log(
                        `Ejecutando: ${toolCall.function.name}`
                    );

                    let contenido;

                    try {
                        const argumentos = JSON.parse(
                            toolCall.function.arguments || "{}"
                        );

                        const resultado = await stitchClient.callTool(
                            toolCall.function.name,
                            argumentos
                        );

                        contenido = JSON.stringify(resultado);
                    } catch (error) {
                        contenido = JSON.stringify({
                            error: error.message
                        });
                    }

                    mensajes.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: contenido
                    });
                }
            } else {
                console.log("\nRespuesta del agente:");
                console.log(mensajeModelo.content);
                tareaCompletada = true;
            }
        }
    } finally {
        await stitchClient.close();
    }
}

iniciarAgente().catch(error => {
    console.error("Error del agente:", error.message);
    process.exitCode = 1;
});
