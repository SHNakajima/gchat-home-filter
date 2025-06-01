// Gmail側でiFrameを監視し、Chat iFrameが読み込まれたら処理を開始
class ChatIFrameManager {
  constructor() {
    this.chatIFrame = null;
    this.observer = null;
    this.init();
  }

  init() {
    // 既存のiFrameをチェック
    this.findChatIFrame();

    // 新しいiFrameの監視を開始
    this.observeIFrames();
  }

  findChatIFrame() {
    // Chat iFrameを検索（複数のパターンに対応）
    const iframes = document.querySelectorAll("iframe");

    for (const iframe of iframes) {
      const src = iframe.src || "";
      const name = iframe.name || "";
      const title = iframe.title || "";

      // Google Chat iFrameの特定
      if (
        src.includes("chat.google.com") ||
        name.includes("chat") ||
        title.includes("チャット") ||
        name === "single_full_screen"
      ) {
        this.setupChatIFrame(iframe);
        break;
      }
    }
  }

  setupChatIFrame(iframe) {
    this.chatIFrame = iframe;
    console.log("Google Chat iFrame detected:", iframe);

    // iFrameが完全に読み込まれるまで待機
    const checkIFrameContent = () => {
      try {
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow.document;

        if (iframeDoc && iframeDoc.readyState === "complete") {
          this.injectIntoIFrame(iframe);
        } else {
          setTimeout(checkIFrameContent, 500);
        }
      } catch (error) {
        // 同一オリジンポリシーで直接アクセスできない場合
        console.log("Cannot directly access iframe content, using postMessage");
        this.setupPostMessageCommunication(iframe);
      }
    };

    checkIFrameContent();
  }

  injectIntoIFrame(iframe) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

      // CSSを注入
      const cssLink = iframeDoc.createElement("link");
      cssLink.rel = "stylesheet";
      cssLink.href = chrome.runtime.getURL("styles.css");
      iframeDoc.head.appendChild(cssLink);

      // JavaScriptを注入
      const script = iframeDoc.createElement("script");
      script.src = chrome.runtime.getURL("content.js");
      iframeDoc.head.appendChild(script);

      console.log("Successfully injected scripts into Chat iFrame");
    } catch (error) {
      console.error("Failed to inject into iFrame:", error);
      this.setupPostMessageCommunication(iframe);
    }
  }

  setupPostMessageCommunication(iframe) {
    // iFrame内のコンテンツスクリプトとの通信を設定
    window.addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow) return;

      // Chat iFrameからのメッセージを処理
      if (event.data.type === "CHAT_FILTER_REQUEST") {
        this.handleIFrameRequest(event.data, iframe);
      }
    });

    // 設定変更をiFrameに通知
    chrome.storage.onChanged.addListener((changes) => {
      iframe.contentWindow.postMessage(
        {
          type: "CHAT_FILTER_SETTINGS_CHANGED",
          changes: changes,
        },
        "*"
      );
    });
  }

  handleIFrameRequest(data, iframe) {
    // iFrameからのリクエストを処理（設定取得など）
    if (data.action === "GET_SETTINGS") {
      chrome.storage.local
        .get(["filterEnabled", "filterRegex"])
        .then((result) => {
          iframe.contentWindow.postMessage(
            {
              type: "CHAT_FILTER_SETTINGS",
              settings: result,
            },
            "*"
          );
        });
    }
  }

  observeIFrames() {
    // DOM変更を監視して新しいiFrameを検出
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "IFRAME") {
              const src = node.src || "";
              const name = node.name || "";
              const title = node.title || "";

              if (
                src.includes("chat.google.com") ||
                name.includes("chat") ||
                title.includes("チャット") ||
                name === "single_full_screen"
              ) {
                this.setupChatIFrame(node);
              }
            } else {
              // 子要素にiFrameがあるかチェック
              const iframes = node.querySelectorAll?.("iframe");
              if (iframes) {
                iframes.forEach((iframe) => {
                  const src = iframe.src || "";
                  const name = iframe.name || "";
                  const title = iframe.title || "";

                  if (
                    src.includes("chat.google.com") ||
                    name.includes("chat") ||
                    title.includes("チャット") ||
                    name === "single_full_screen"
                  ) {
                    this.setupChatIFrame(iframe);
                  }
                });
              }
            }
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

// Gmail上でiFrame管理を開始
if (window.location.hostname === "mail.google.com") {
  new ChatIFrameManager();
}
