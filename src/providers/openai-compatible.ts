import { requestUrl } from "obsidian";
import { LocalGPTAction, AIProvider } from "../interfaces";
import { streamer } from "../streamer";

export interface OpenAICompatibleMessage {
	role: "system" | "user";
	content: string;
}
export interface OpenAICompatibleRequestBody {
	messages: OpenAICompatibleMessage[];
	stream: boolean;
	model: string;
}

export class OpenAICompatibleAIProvider implements AIProvider {
	constructor({ url, apiKey, defaultModel, abortController, onUpdate }: any) {
		this.url = url;
		this.apiKey = apiKey;
		this.defaultModel = defaultModel;
		this.abortController = abortController;
		this.onUpdate = onUpdate;
	}
	url: string;
	apiKey: string;
	defaultModel: string;
	onUpdate: (text: string) => void;
	abortController: AbortController;

	process(text: string, action: LocalGPTAction): Promise<string> {
		const requestBody: OpenAICompatibleRequestBody = {
			stream: true,
			model: action.model || this.defaultModel,
			messages: [
				(action.system && {
					role: "system",
					content: action.system,
				}) as OpenAICompatibleMessage,
				{
					role: "user",
					content: [action.prompt, text].filter(Boolean).join("\n\n"),
				},
			].filter(Boolean) as OpenAICompatibleMessage[],
		};

		const { abortController } = this;

		return fetch(`${this.url.replace(/\/+$/i, "")}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.apiKey && {
					Authorization: `Bearer ${this.apiKey}`,
				}),
			},
			body: JSON.stringify(requestBody),
			signal: abortController.signal,
		}).then((response) => {
			let combined = "";

			return new Promise((resolve, reject) => {
				streamer({
					response,
					abortController,
					onNext: (data: string) => {
						const lines = data
							.split("\n")
							.filter((line: string) => line.trim() !== "");
						for (const line of lines) {
							const message = line.replace(/^data: /, "");
							if (message === "[DONE]") {
								break;
							}
							try {
								const parsed = JSON.parse(message);
								combined +=
									parsed.choices[0]?.delta?.content || "";
							} catch (error) {
								try {
									reject(JSON.parse(data).error);
								} catch (e) {
									reject(
										"Could not JSON parse stream message",
									);
									console.error(
										"Could not JSON parse stream message",
										message,
										error,
									);
								}
							}
						}
						this.onUpdate(combined);
					},
					onDone: () => {
						resolve(combined);
						return combined;
					},
				});
			});
		});
	}
}
