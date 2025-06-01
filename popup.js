class PopupManager {
  constructor() {
    this.regexInput = document.getElementById("regexInput");
    this.saveButton = document.getElementById("saveButton");
    this.status = document.getElementById("status");

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(["filterRegex"]);
      this.regexInput.value = result.filterRegex || "";
    } catch (error) {
      this.showStatus("設定の読み込みに失敗しました", "error");
    }
  }

  setupEventListeners() {
    this.saveButton.addEventListener("click", () => this.saveSettings());

    // Enterキーでの保存（Ctrl+Enter）
    this.regexInput.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        this.saveSettings();
      }
    });

    // 例をクリックで入力
    document.querySelectorAll(".example").forEach((example) => {
      example.addEventListener("click", () => {
        this.regexInput.value = example.dataset.regex;
        this.regexInput.focus();
      });
    });
  }

  async saveSettings() {
    const regex = this.regexInput.value.trim();

    // 正規表現の妥当性チェック
    if (regex) {
      try {
        new RegExp(regex);
      } catch (error) {
        this.showStatus("正規表現が無効です: " + error.message, "error");
        return;
      }
    }

    try {
      await chrome.storage.local.set({ filterRegex: regex });

      // アクティブなタブに変更を通知
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url.includes("chat.google.com")) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateRegex",
          regex: regex,
        });
      }

      this.showStatus("設定を保存しました", "success");
    } catch (error) {
      this.showStatus("設定の保存に失敗しました", "error");
    }
  }

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type} show`;

    setTimeout(() => {
      this.status.classList.remove("show");
    }, 3000);
  }
}

// ポップアップ初期化
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});
