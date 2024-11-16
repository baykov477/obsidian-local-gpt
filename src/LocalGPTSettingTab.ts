import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS } from "defaultSettings";
import LocalGPT from "./main";
import { LocalGPTAction, Providers } from "./interfaces";
import { OllamaAIProvider } from "./providers/ollama";
import { OpenAICompatibleAIProvider } from "./providers/openai-compatible";
import { clearEmbeddingsCache } from "rag";

const SEPARATOR = "✂️";

export class LocalGPTSettingTab extends PluginSettingTab {
	plugin: LocalGPT;
	editEnabled: boolean = false;
	editExistingAction?: LocalGPTAction;
	modelsOptions: any = {};
	changingOrder = false;
	useFallback = false;
	selectedProvider = "";

	constructor(app: App, plugin: LocalGPT) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		this.selectedProvider =
			this.selectedProvider || this.plugin.settings.defaults.provider;
		this.useFallback =
			this.useFallback ||
			Boolean(this.plugin.settings.defaults.fallbackProvider);

		const mainProviders = {
			[Providers.OLLAMA]: "Ollama",
			[Providers.OPENAI_COMPATIBLE]: "OpenAI compatible server",
		};

		const fallbackProviders = {
			...mainProviders,
		};

		if (this.plugin.settings.defaults.provider === Providers.OLLAMA) {
			// @ts-ignore
			delete fallbackProviders[Providers.OLLAMA];
			// @ts-ignore
			fallbackProviders[Providers.OLLAMA_FALLBACK] = "2️⃣ Ollama";
		}
		if (
			this.plugin.settings.defaults.provider ===
			Providers.OPENAI_COMPATIBLE
		) {
			// @ts-ignore
			delete fallbackProviders[Providers.OPENAI_COMPATIBLE];
			// @ts-ignore
			fallbackProviders[Providers.OPENAI_COMPATIBLE_FALLBACK] =
				"2️⃣ OpenAI compatible servers";
		}

		const selectedAIProviderSetting = new Setting(containerEl)
			.setHeading()
			.setName("")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(mainProviders)
					.setValue(String(this.plugin.settings.defaults.provider))
					.onChange(async (value) => {
						this.plugin.settings.defaults.provider = value;
						this.selectedProvider = value;

						if (this.useFallback) {
							// @ts-ignore
							this.plugin.settings.fallbackProvider = Object.keys(
								mainProviders,
							).find((key) => key !== value);
						}

						await this.plugin.saveSettings();
						this.display();
					}),
			);

		selectedAIProviderSetting.nameEl.innerHTML =
			"<h3>Selected AI provider</h3>";

		new Setting(containerEl)
			.setName("Creativity")
			.setDesc("")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "⚪ None")
					.addOptions({
						low: "️💡 Low",
						medium: "🎨 Medium",
						high: "🚀 High",
					})
					.setValue(
						String(this.plugin.settings.defaults.creativity) || "",
					)
					.onChange(async (value) => {
						this.plugin.settings.defaults.creativity = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Use fallback")
			.addToggle((component) => {
				component.setValue(this.useFallback).onChange(async (value) => {
					this.useFallback = value;
					if (value) {
						const firstAvailableProvider =
							Object.keys(fallbackProviders)[0];
						this.plugin.settings.defaults.fallbackProvider =
							firstAvailableProvider;
						this.selectedProvider = firstAvailableProvider;
					} else {
						this.plugin.settings.defaults.fallbackProvider = "";
						this.selectedProvider =
							this.plugin.settings.defaults.provider;
					}
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.useFallback) {
			new Setting(containerEl)
				.setName("Fallback AI provider")
				.setDesc(
					"If the Default provider is not accessible the plugin will try to reach the fallback one.",
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOptions(fallbackProviders)
						.setValue(
							String(
								this.plugin.settings.defaults.fallbackProvider,
							),
						)
						.onChange(async (value) => {
							this.plugin.settings.defaults.fallbackProvider =
								value;
							this.selectedProvider = value;
							await this.plugin.saveSettings();
							this.display();
						}),
				);
		}

		containerEl.createEl("div", { cls: "local-gpt-settings-separator" });

		containerEl.createEl("h3", { text: "Providers configuration" });
		const selectedProviderConfig =
			this.plugin.settings.providers[this.selectedProvider];

		const aiProvider = new Setting(containerEl)
			.setHeading()
			.setName("Configure AI provider")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						...mainProviders,
						...(this.useFallback && {
							[Providers.OLLAMA_FALLBACK]: "2️⃣ Ollama",
							[Providers.OPENAI_COMPATIBLE_FALLBACK]:
								"2️⃣ OpenAI compatible servers",
						}),
					})
					.setValue(String(this.selectedProvider))
					.onChange(async (value) => {
						this.selectedProvider = value;
						this.display();
					}),
			);

		if (selectedProviderConfig.type === Providers.OLLAMA) {
			const ollamaUrl = new Setting(containerEl)
				.setName("Ollama URL")
				.setDesc("")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:11434")
						.setValue(selectedProviderConfig.url)
						.onChange(async (value) => {
							selectedProviderConfig.url = value;
							await this.plugin.saveSettings();
						}),
				);

			ollamaUrl.descEl.innerHTML = `Default is <code title="Click to copy" onclick="navigator.clipboard.writeText('http://localhost:11434')">http://localhost:11434</code>`;

			const ollamaDefaultModel = new Setting(containerEl)
				.setName("Default model")
				.setDesc("Name of the default Ollama model to use in prompts");

			const ollamaEmbeddingModel = new Setting(containerEl)
				.setName("Embedding model")
				.setDesc(
					"Optional. Name of the Ollama embedding model to use for Enhanced Actions",
				);

			if (selectedProviderConfig.type === Providers.OLLAMA) {
				OllamaAIProvider.getModels(selectedProviderConfig)
					.then((models) => {
						this.modelsOptions = models;

						ollamaDefaultModel
							.addDropdown((dropdown) =>
								dropdown
									.addOptions(this.modelsOptions)
									.setValue(
										String(
											selectedProviderConfig.defaultModel,
										),
									)
									.onChange(async (value) => {
										selectedProviderConfig.defaultModel =
											value;
										await this.plugin.saveSettings();
									}),
							)
							.addButton((button) =>
								button
									.setIcon("refresh-cw")
									.onClick(async () => {
										this.display();
									}),
							);
						ollamaEmbeddingModel.addDropdown((dropdown) =>
							dropdown
								.addOption("", "No enhancement")
								.addOptions(this.modelsOptions)
								.setValue(
									String(
										selectedProviderConfig.embeddingModel,
									),
								)
								.onChange(async (value) => {
									clearEmbeddingsCache();
									selectedProviderConfig.embeddingModel =
										value;
									await this.plugin.saveSettings();
								}),
						);
					})
					.catch(() => {
						ollamaDefaultModel.descEl.innerHTML = `Get the models from <a href="https://ollama.com/library">Ollama library</a> or check that Ollama URL is correct.`;
						ollamaDefaultModel.addButton((button) =>
							button.setIcon("refresh-cw").onClick(async () => {
								this.display();
							}),
						);
					});
			}
		}
		if (selectedProviderConfig.type === Providers.OPENAI_COMPATIBLE) {
			const openAICompatible = new Setting(containerEl)
				.setName("OpenAI compatible server URL")
				.setDesc("")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:8080/v1")
						.setValue(selectedProviderConfig.url)
						.onChange(async (value) => {
							selectedProviderConfig.url = value;
							await this.plugin.saveSettings();
						}),
				);
			openAICompatible.descEl.innerHTML = `
				Put the URL in the format <code>http://localhost:8080/v1</code><br/>
				<br/>
				There are several options to run local OpenAI-like server:
				<ul>
					<li><a href="https://docs.openwebui.com/tutorials/integrations/continue-dev/">Open WebUI</a></li>
					<li>Obabooga <a href="https://github.com/pfrankov/obsidian-local-gpt/discussions/8">Text generation web UI</a></li>
					<li><a href="https://lmstudio.ai/">LM Studio</a></li>
				</ul>
				After all installation and configuration make sure that you're using compatible model.<br/>
				It is necessary to use models in ChatML format.
			`;

			const apiKey = new Setting(containerEl)
				.setName("API key")
				.setDesc("")
				.addText((text) =>
					text
						.setPlaceholder("")
						// @ts-ignore
						.setValue(selectedProviderConfig.apiKey)
						.onChange(async (value) => {
							selectedProviderConfig.apiKey = value;
							await this.plugin.saveSettings();
						}),
				);

			apiKey.descEl.innerHTML = `
				Optional. Check <a href="https://github.com/pfrankov/obsidian-local-gpt#using-with-openai">the docs</a> if you'd like to use OpenAI servers.
			`;

			const openaiDefaultModel = new Setting(containerEl)
				.setName("Default model")
				.setDesc(
					"Optional. Name of the default model to use in prompts",
				);

			const openaiEmbeddingModel = new Setting(containerEl)
				.setName("Embedding model")
				.setDesc(
					"Optional. Name of the embedding model to use for Enhanced Actions",
				);

			if (selectedProviderConfig.url) {
				OpenAICompatibleAIProvider.getModels(selectedProviderConfig)
					.then((models) => {
						openaiDefaultModel
							.addDropdown((dropdown) =>
								dropdown
									.addOption("", "Not specified")
									.addOptions(models)
									.setValue(
										String(
											selectedProviderConfig.defaultModel,
										) || "",
									)
									.onChange(async (value) => {
										selectedProviderConfig.defaultModel =
											value;
										await this.plugin.saveSettings();
									}),
							)
							.addButton((button) =>
								button
									.setIcon("refresh-cw")
									.onClick(async () => {
										this.display();
									}),
							);
						openaiEmbeddingModel.addDropdown((dropdown) =>
							dropdown
								.addOption("", "No enhancement")
								.addOptions(models)
								.setValue(
									String(
										selectedProviderConfig.embeddingModel,
									) || "",
								)
								.onChange(async (value) => {
									clearEmbeddingsCache();
									selectedProviderConfig.embeddingModel =
										value;
									await this.plugin.saveSettings();
								}),
						);
					})
					.catch(() => {
						openaiDefaultModel.addButton((button) =>
							button.setIcon("refresh-cw").onClick(async () => {
								this.display();
							}),
						);
					});
			}
		}

		const editingAction: LocalGPTAction = this.editExistingAction || {
			name: "",
			prompt: "",
			model: "",
			temperature: undefined,
			system: "",
			replace: false,
		};

		const sharingActionsMapping = {
			name: "Name: ",
			system: "System: ",
			prompt: "Prompt: ",
			replace: "Replace: ",
			model: "Model: ",
		};

		containerEl.createEl("div", { cls: "local-gpt-settings-separator" });

		containerEl.createEl("h3", { text: "Actions" });

		if (!this.editEnabled) {
			const quickAdd = new Setting(containerEl)
				.setName("Quick add")
				.setDesc("")
				.addText((text) => {
					text.inputEl.style.minWidth = "100%";
					text.setPlaceholder("Paste action");
					text.onChange(async (value) => {
						const quickAddAction: LocalGPTAction = value
							.split(SEPARATOR)
							.map((part) => part.trim())
							.reduce((acc, part) => {
								const foundMatchKey = Object.keys(
									sharingActionsMapping,
								).find((key) => {
									return part.startsWith(
										sharingActionsMapping[
											key as keyof typeof sharingActionsMapping
										],
									);
								});

								if (foundMatchKey) {
									// @ts-ignore
									acc[foundMatchKey] = part.substring(
										sharingActionsMapping[
											foundMatchKey as keyof typeof sharingActionsMapping
										].length,
										part.length,
									);
								}

								return acc;
							}, {} as LocalGPTAction);

						if (quickAddAction.name) {
							await this.addNewAction(quickAddAction);
							text.setValue("");
							this.display();
						}
					});
				});

			quickAdd.descEl.innerHTML = `You can share the best sets prompts or get one <a href="https://github.com/pfrankov/obsidian-local-gpt/discussions/2">from the community</a>.<br/><strong>Important:</strong> if you already have an action with the same name it will be overwritten.`;

			new Setting(containerEl)
				.setName("Add new manually")
				.addButton((button) =>
					button.setIcon("plus").onClick(async () => {
						this.editEnabled = true;
						this.editExistingAction = undefined;
						this.display();
					}),
				);
		} else {
			if (
				this.plugin.settings.providers[
					this.plugin.settings.defaults.provider
				].type === Providers.OLLAMA
			) {
				new Setting(containerEl)
					.setName("Model")
					.setDesc("Optional")
					.addDropdown((dropdown) => {
						dropdown
							.addOption("", "Default model")
							.addOptions(this.modelsOptions)
							.onChange(async (value) => {
								editingAction.model = value;
							});
						editingAction?.model &&
							dropdown.setValue(editingAction.model);
					});
			}
			new Setting(containerEl).setName("Action name").addText((text) => {
				editingAction?.name && text.setValue(editingAction.name);
				text.inputEl.style.minWidth = "100%";
				text.setPlaceholder("Summarize selection");
				text.onChange(async (value) => {
					editingAction.name = value;
				});
			});

			new Setting(containerEl)
				.setName("System prompt")
				.setDesc("Optional")
				.addTextArea((text) => {
					editingAction?.system &&
						text.setValue(editingAction.system);
					text.inputEl.style.minWidth = "100%";
					text.inputEl.style.minHeight = "6em";
					text.inputEl.style.resize = "vertical";
					text.setPlaceholder("You are a helpful assistant.");
					text.onChange(async (value) => {
						editingAction.system = value;
					});
				});

			const promptSetting = new Setting(containerEl)
				.setName("Prompt")
				.setDesc("")
				.addTextArea((text) => {
					editingAction?.prompt &&
						text.setValue(editingAction.prompt);
					text.inputEl.style.minWidth = "100%";
					text.inputEl.style.minHeight = "6em";
					text.inputEl.style.resize = "vertical";
					text.setPlaceholder("");
					text.onChange(async (value) => {
						editingAction.prompt = value;
					});
				});

			promptSetting.descEl.innerHTML = `Please read about<br/><a href="https://github.com/pfrankov/obsidian-local-gpt/blob/master/docs/prompt-templating.md">Prompt templating</a><br/>if you want to customize<br/>your resulting prompts`;

			new Setting(containerEl)
				.setName("Replace selected text")
				.setDesc(
					"If checked, the highlighted text will be replaced with a response from the model.",
				)
				.addToggle((component) => {
					editingAction?.replace &&
						component.setValue(editingAction.replace);
					component.onChange(async (value) => {
						editingAction.replace = value;
					});
				});

			const actionButtonsRow = new Setting(containerEl).setName("");

			if (this.editExistingAction) {
				actionButtonsRow.addButton((button) => {
					button.buttonEl.style.marginRight = "2em";
					button.setButtonText("Remove").onClick(async () => {
						if (!button.buttonEl.hasClass("mod-warning")) {
							button.setClass("mod-warning");
							return;
						}

						this.plugin.settings.actions =
							this.plugin.settings.actions.filter(
								(innerAction) => innerAction !== editingAction,
							);
						await this.plugin.saveSettings();
						this.editExistingAction = undefined;
						this.editEnabled = false;
						this.display();
					});
				});
			}

			actionButtonsRow
				.addButton((button) => {
					button.setButtonText("Close").onClick(async () => {
						this.editEnabled = false;
						this.editExistingAction = undefined;
						this.display();
					});
				})
				.addButton((button) =>
					button
						.setCta()
						.setButtonText("Save")
						.onClick(async () => {
							if (!editingAction.name) {
								new Notice(
									"Please enter a name for the action.",
								);
								return;
							}

							if (!this.editExistingAction) {
								if (
									this.plugin.settings.actions.find(
										(action) =>
											action.name === editingAction.name,
									)
								) {
									new Notice(
										`An action with the name "${editingAction.name}" already exists.`,
									);
									return;
								}

								await this.addNewAction(editingAction);
							} else {
								if (
									this.plugin.settings.actions.filter(
										(action) =>
											action.name === editingAction.name,
									).length > 1
								) {
									new Notice(
										`An action with the name "${editingAction.name}" already exists.`,
									);
									return;
								}

								const index =
									this.plugin.settings.actions.findIndex(
										(innerAction) =>
											innerAction === editingAction,
									);

								this.plugin.settings.actions[index] =
									editingAction;
							}

							await this.plugin.saveSettings();

							this.editEnabled = false;
							this.editExistingAction = undefined;
							this.display();
						}),
				);
		}

		containerEl.createEl("h4", { text: "Actions list" });

		let defaultModel = "";
		if (selectedProviderConfig.type === Providers.OLLAMA) {
			defaultModel = selectedProviderConfig.defaultModel;
		}

		this.plugin.settings.actions.forEach((action, actionIndex) => {
			const sharingString = [
				action.name && `${sharingActionsMapping.name}${action.name}`,
				action.system &&
					`${sharingActionsMapping.system}${action.system}`,
				action.prompt &&
					`${sharingActionsMapping.prompt}${action.prompt}`,
				action.replace &&
					`${sharingActionsMapping.replace}${action.replace}`,
				this.plugin.settings.defaults.provider === Providers.OLLAMA &&
					(action.model || defaultModel) &&
					`${sharingActionsMapping.model}${
						action.model || defaultModel
					}`,
			]
				.filter(Boolean)
				.join(` ${SEPARATOR}\n`);

			if (!this.changingOrder) {
				const actionRow = new Setting(containerEl)
					.setName(action.name)
					.setDesc("")
					.addButton((button) =>
						button.setIcon("copy").onClick(async () => {
							navigator.clipboard.writeText(sharingString);
							new Notice("Copied");
						}),
					)
					.addButton((button) =>
						button.setButtonText("Edit").onClick(async () => {
							this.editEnabled = true;
							this.editExistingAction =
								this.plugin.settings.actions.find(
									(innerAction) =>
										innerAction.name == action.name,
								);
							this.display();
						}),
					);

				function escapeTitle(title?: string) {
					if (!title) {
						return "";
					}

					return title
						.replace(/&/g, "&amp;")
						.replace(/</g, "&lt;")
						.replace(/>/g, "&gt;")
						.replace(/"/g, "&quot;")
						.replace(/'/g, "&#039;");
				}

				const systemTitle = escapeTitle(action.system);

				const promptTitle = escapeTitle(action.prompt);

				actionRow.descEl.innerHTML = [
					action.system &&
						`<div title="${systemTitle}" style="text-overflow: ellipsis; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
							<b>${sharingActionsMapping.system}</b>${action.system}</div>`,
					action.prompt &&
						`<div title="${promptTitle}" style="text-overflow: ellipsis; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
							<b>${sharingActionsMapping.prompt}</b>${action.prompt}
						</div>`,
					this.plugin.settings.defaults.provider ===
						Providers.OLLAMA &&
						action.model &&
						`<b>${sharingActionsMapping.model}</b>${action.model}`,
				]
					.filter(Boolean)
					.join("<br/>\n");
			} else {
				const actionRow = new Setting(containerEl)
					.setName(action.name)
					.setDesc("");

				if (actionIndex > 0) {
					actionRow.addButton((button) =>
						button.setIcon("arrow-up").onClick(async () => {
							const prev =
								this.plugin.settings.actions[actionIndex - 1];
							this.plugin.settings.actions[actionIndex - 1] =
								action;
							this.plugin.settings.actions[actionIndex] = prev;
							await this.plugin.saveSettings();
							this.display();
						}),
					);
				}
				if (actionIndex < this.plugin.settings.actions.length - 1) {
					actionRow.addButton((button) =>
						button.setIcon("arrow-down").onClick(async () => {
							const next =
								this.plugin.settings.actions[actionIndex + 1];
							this.plugin.settings.actions[actionIndex + 1] =
								action;
							this.plugin.settings.actions[actionIndex] = next;
							await this.plugin.saveSettings();
							this.display();
						}),
					);
				}
			}
		});

		if (this.plugin.settings.actions.length) {
			new Setting(containerEl).setName("").addButton((button) => {
				this.changingOrder && button.setCta();
				button
					.setButtonText(this.changingOrder ? "Done" : "Change order")
					.onClick(async () => {
						this.changingOrder = !this.changingOrder;
						this.display();
					});
			});
		}

		containerEl.createEl("h4", { text: "Danger zone" });
		new Setting(containerEl)
			.setName("Reset actions")
			.setDesc(
				"🚨 Reset all actions to the default. This cannot be undone and will delete all your custom actions.",
			)
			.addButton((button) =>
				button
					.setClass("mod-warning")
					.setButtonText("Reset")
					.onClick(async () => {
						button.setDisabled(true);
						button.buttonEl.setAttribute("disabled", "true");
						button.buttonEl.classList.remove("mod-warning");
						this.plugin.settings.actions = DEFAULT_SETTINGS.actions;
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}

	async addNewAction(editingAction: LocalGPTAction) {
		const alreadyExistingActionIndex =
			this.plugin.settings.actions.findIndex(
				(action) => action.name === editingAction.name,
			);

		if (alreadyExistingActionIndex >= 0) {
			this.plugin.settings.actions[alreadyExistingActionIndex] =
				editingAction;
			new Notice(`Rewritten "${editingAction.name}" action`);
		} else {
			this.plugin.settings.actions = [
				editingAction,
				...this.plugin.settings.actions,
			];
			new Notice(`Added "${editingAction.name}" action`);
		}
		await this.plugin.saveSettings();
	}
}
