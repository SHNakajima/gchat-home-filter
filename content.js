class GoogleChatFilter {
  constructor() {
    this.isEnabled = false;
    this.filterRegex = "";
    this.hiddenCount = 0;
    this.toggleButton = null;
    this.countDisplay = null;
    this.observer = null;
    this.isInIFrame = window.self !== window.top;

    this.init();
  }

  async init() {
    // iFrame内かどうかで処理を分岐
    if (this.isInIFrame) {
      await this.initInIFrame();
    } else {
      await this.initStandalone();
    }
  }

  async initInIFrame() {
    console.log("Initializing Chat Filter in iFrame");

    // 親ウィンドウに設定を要求
    window.parent.postMessage(
      {
        type: "CHAT_FILTER_REQUEST",
        action: "GET_SETTINGS",
      },
      "*"
    );

    // 親ウィンドウからのメッセージを監視
    window.addEventListener("message", (event) => {
      if (event.data.type === "CHAT_FILTER_SETTINGS") {
        this.isEnabled = event.data.settings.filterEnabled || false;
        this.filterRegex = event.data.settings.filterRegex || "";
        this.initializeUI();
        this.observeChanges();
      } else if (event.data.type === "CHAT_FILTER_SETTINGS_CHANGED") {
        this.handleSettingsChange(event.data.changes);
      }
    });
  }

  async initStandalone() {
    console.log("Initializing Chat Filter in standalone mode");

    // 通常の初期化処理
    await this.loadSettings();
    this.initializeUI();
    this.observeChanges();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        "filterEnabled",
        "filterRegex",
      ]);
      this.isEnabled = result.filterEnabled || false;
      this.filterRegex = result.filterRegex || "";
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        filterEnabled: this.isEnabled,
        filterRegex: this.filterRegex,
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  handleSettingsChange(changes) {
    if (changes.filterEnabled) {
      this.isEnabled = changes.filterEnabled.newValue;
    }
    if (changes.filterRegex) {
      this.filterRegex = changes.filterRegex.newValue;
    }

    // UI更新
    if (this.toggleButton) {
      this.toggleButton.className = `chat-filter-toggle ${
        this.isEnabled ? "active" : ""
      }`;
      this.toggleButton.querySelector(".toggle-text").textContent = this
        .isEnabled
        ? "ON"
        : "OFF";
    }

    // フィルタ再適用
    if (this.isEnabled) {
      this.applyFilter();
    } else {
      this.showAllMessages();
    }
  }

  initializeUI() {
    // 既存のボタンがあれば削除
    const existingButton = document.querySelector(".chat-filter-toggle");
    if (existingButton) {
      existingButton.remove();
    }

    // メイン領域を探す（複数の方法で試行）
    const regionDiv = this.findRegionDiv();
    if (!regionDiv) {
      console.log("Region div not found, retrying...");
      setTimeout(() => this.initializeUI(), 1000);
      return;
    }

    const flexChild = regionDiv.children[0];
    if (!flexChild) {
      setTimeout(() => this.initializeUI(), 1000);
      return;
    }

    // トグルボタンコンテナを作成
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "chat-filter-container";

    // トグルボタン
    const toggleButton = document.createElement("button");
    toggleButton.className = `chat-filter-toggle ${
      this.isEnabled ? "active" : ""
    }`;
    toggleButton.innerHTML = `
        <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
        </svg>
        <span class="toggle-text">${this.isEnabled ? "ON" : "OFF"}</span>
      `;

    // カウント表示
    const countDisplay = document.createElement("span");
    countDisplay.className = "chat-filter-count";
    countDisplay.textContent = `非表示: ${this.hiddenCount}件`;

    // イベントリスナー
    toggleButton.addEventListener("click", () => this.toggleFilter());

    buttonContainer.appendChild(toggleButton);
    buttonContainer.appendChild(countDisplay);

    // flexChildの最初に挿入
    flexChild.insertBefore(buttonContainer, flexChild.firstChild);

    this.toggleButton = toggleButton;
    this.countDisplay = countDisplay;

    console.log("Chat Filter UI initialized");

    // 初期フィルタリング実行
    if (this.isEnabled) {
      this.applyFilter();
    }
  }

  findRegionDiv() {
    // 複数の方法でregion divを探す
    let regionDiv = document.querySelector('div[role="region"]');

    if (!regionDiv) {
      // 代替方法：main要素やその他の候補を探す
      const candidates = [
        'main[role="main"]',
        "div[data-view-component-id]",
        "div.nH.nn",
        "div.nH",
      ];

      for (const selector of candidates) {
        const element = document.querySelector(selector);
        if (element) {
          regionDiv = element;
          break;
        }
      }
    }

    return regionDiv;
  }

  async toggleFilter() {
    this.isEnabled = !this.isEnabled;

    if (!this.isInIFrame) {
      await this.saveSettings();
    }

    // UI更新
    this.toggleButton.className = `chat-filter-toggle ${
      this.isEnabled ? "active" : ""
    }`;
    this.toggleButton.querySelector(".toggle-text").textContent = this.isEnabled
      ? "ON"
      : "OFF";

    if (this.isEnabled) {
      this.applyFilter();
    } else {
      this.showAllMessages();
    }
  }

  applyFilter() {
    if (!this.filterRegex) return;

    try {
      const regex = new RegExp(this.filterRegex, "i");
      const messageItems = document.querySelectorAll('span[role="listitem"]');
      let hiddenCount = 0;

      messageItems.forEach((item) => {
        const targetElement = this.findTargetElement(item);
        if (targetElement) {
          const text = targetElement.innerText;
          if (regex.test(text)) {
            item.style.display = "none";
            item.classList.add("chat-filter-hidden");
            hiddenCount++;
          } else {
            item.style.display = "";
            item.classList.remove("chat-filter-hidden");
          }
        }
      });

      this.hiddenCount = hiddenCount;
      this.updateCountDisplay();
    } catch (error) {
      console.error("Filter regex error:", error);
    }
  }

  findTargetElement(listItem) {
    // span (role="listitem")>div(1st child)>div(1st child)>div(1st child)>div(2nd child)>div(1st child)>div(1st child)>div(1st child)
    try {
      const path =
        listItem.children[0]?.children[0]?.children[0]?.children[1]?.children[0]
          ?.children[0]?.children[0];
      return path;
    } catch (error) {
      return null;
    }
  }

  showAllMessages() {
    const hiddenItems = document.querySelectorAll(".chat-filter-hidden");
    hiddenItems.forEach((item) => {
      item.style.display = "";
      item.classList.remove("chat-filter-hidden");
    });

    this.hiddenCount = 0;
    this.updateCountDisplay();
  }

  updateCountDisplay() {
    if (this.countDisplay) {
      this.countDisplay.textContent = `非表示: ${this.hiddenCount}件`;
    }
  }

  observeChanges() {
    // DOM変更を監視してフィルタを再適用
    this.observer = new MutationObserver((mutations) => {
      let shouldReapply = false;

      mutations.forEach((mutation) => {
        // 新しいメッセージが追加された場合
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (let node of mutation.addedNodes) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              (node.querySelector?.('span[role="listitem"]') ||
                node.matches?.('span[role="listitem"]'))
            ) {
              shouldReapply = true;
              break;
            }
          }
        }
      });

      if (shouldReapply && this.isEnabled) {
        setTimeout(() => this.applyFilter(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // 設定変更を監視
  async updateFilterRegex(newRegex) {
    this.filterRegex = newRegex;

    if (!this.isInIFrame) {
      await this.saveSettings();
    }

    if (this.isEnabled) {
      this.applyFilter();
    }
  }
}

// 拡張機能の初期化
let chatFilter;

// ページ読み込み完了後に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFilter);
} else {
  initFilter();
}

function initFilter() {
  // Google Chatページかチェック（iFrame内も含む）
  if (
    window.location.hostname === "chat.google.com" ||
    window.location.href.includes("chat.google.com")
  ) {
    chatFilter = new GoogleChatFilter();
  }
}

// ポップアップからのメッセージを受信
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateRegex") {
      chatFilter?.updateFilterRegex(request.regex);
      sendResponse({ success: true });
    }
  });
}
