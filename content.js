// note.com 下書き一括公開 - Content Script
// マウス操作を自動化して下書きを順番に公開

(function() {
  'use strict';

  const STORAGE_KEY = 'note_bulk_publish_state';

  // 状態管理（chrome.storage.localを使用してドメイン間で共有）
  async function getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || { active: false, count: 0 });
      });
    });
  }

  async function setState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
    });
  }

  async function clearState() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, resolve);
    });
  }

  // 要素を待機して取得
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりません: ${selector}`));
      }, timeout);
    });
  }

  // 少し待機
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // クリックをシミュレート
  function simulateClick(element) {
    element.click();
  }

  // 現在のページを判定
  function getCurrentPage() {
    const url = window.location.href;
    const host = window.location.hostname;

    if (url.includes('/notes') && url.includes('status=draft')) {
      return 'draft_list';
    } else if (host === 'editor.note.com' && url.includes('/edit')) {
      return 'edit_page';
    } else if (url.includes('/n/') && url.includes('/edit')) {
      return 'edit_page';
    } else if (url.includes('/n/')) {
      return 'article_page';
    }
    return 'unknown';
  }

  // Step 2: 下書き一覧で最初のエントリの...ボタンをクリック
  async function clickFirstDraftMenu() {
    console.log('[一括公開] 下書き一覧ページ - メニューボタンを探しています...');

    await sleep(2000); // ページ読み込み待ち

    let menuButton = null;

    // note.comの下書き一覧の「...」ボタンを取得
    // クラス名: o-articleList__more, aria-label: その他
    const selectors = [
      'button.o-articleList__more',
      'button[aria-label="その他"]',
      '.o-articleList__others button'
    ];

    for (const selector of selectors) {
      menuButton = document.querySelector(selector);
      if (menuButton) {
        console.log(`[一括公開] セレクタ "${selector}" でメニューボタンを発見`);
        break;
      }
    }

    if (!menuButton) {
      throw new Error('メニューボタンが見つかりません。下書きがないか、UIが変更された可能性があります。');
    }

    console.log('[一括公開] メニューボタンをクリック');
    simulateClick(menuButton);

    // Step 3: ポップアップから「編集」をクリック
    await sleep(1000);
    await clickEditButton();
  }

  // Step 3: 編集ボタンをクリック
  async function clickEditButton() {
    console.log('[一括公開] 編集ボタンを探しています...');

    // ポップアップメニューから「編集」ボタンを探す
    // class: m-basicBalloonList__button
    const buttons = document.querySelectorAll('button.m-basicBalloonList__button, .m-basicBalloonList__item button');

    for (const btn of buttons) {
      const text = btn.textContent.trim();
      if (text === '編集') {
        console.log('[一括公開] 編集ボタンをクリック');
        simulateClick(btn);
        return;
      }
    }

    throw new Error('編集ボタンが見つかりません');
  }

  // Step 4: 編集画面で「公開に進む」ボタンをクリック
  async function clickPublishButton() {
    console.log('[一括公開] 編集ページ - 公開に進むボタンを探しています...');

    await sleep(3000); // ページ読み込み待ち（エディタは重いので長めに）

    // 「公開に進む」ボタンを探す
    const buttons = document.querySelectorAll('button');

    for (const btn of buttons) {
      const text = btn.textContent.trim();
      if (text === '公開に進む') {
        console.log('[一括公開] 公開に進むボタンをクリック');
        simulateClick(btn);
        await sleep(2000);
        await clickPostButton();
        return;
      }
    }

    throw new Error('公開に進むボタンが見つかりません');
  }

  // Step 5: 確認画面で「投稿する」ボタンをクリック
  async function clickPostButton() {
    console.log('[一括公開] 投稿するボタンを探しています...');

    await sleep(1000);

    const buttons = document.querySelectorAll('button');

    for (const btn of buttons) {
      const text = btn.textContent.trim();
      if (text === '投稿する' || text === '投稿') {
        console.log('[一括公開] 投稿するボタンをクリック');
        simulateClick(btn);
        await sleep(2000);
        await closeShareDialog();
        return;
      }
    }

    throw new Error('投稿するボタンが見つかりません');
  }

  // Step 6: シェアダイアログを閉じる
  async function closeShareDialog() {
    console.log('[一括公開] シェアダイアログを閉じます...');

    await sleep(2000);

    // ×ボタンを探す
    const closeButtons = document.querySelectorAll('button[aria-label*="閉じる"], button[aria-label*="close"], [class*="close"] button, button:has(svg)');

    for (const btn of closeButtons) {
      const rect = btn.getBoundingClientRect();
      // 右上にあるボタンを探す（モーダルの閉じるボタン）
      if (rect.top < 200 && rect.right > window.innerWidth * 0.6) {
        console.log('[一括公開] 閉じるボタンをクリック');
        simulateClick(btn);
        await sleep(1000);
        break;
      }
    }

    // 閉じるボタンクリック後、ページ遷移が発生する
    // カウント更新は article_page で行う（ここでは遷移前に中断されるため）
    console.log(`[一括公開] シェアダイアログを閉じました - ページ遷移を待機中...`);
  }

  // メイン処理
  async function processCurrentPage() {
    const state = await getState();

    if (!state.active) {
      return; // 自動処理が有効でない場合は何もしない
    }

    const page = getCurrentPage();
    console.log(`[一括公開] 現在のページ: ${page}, 公開済み: ${state.count}件`);

    try {
      switch (page) {
        case 'draft_list':
          await clickFirstDraftMenu();
          break;
        case 'edit_page':
          await clickPublishButton();
          break;
        case 'article_page':
          // 公開後の記事ページにリダイレクトされた場合
          // ここでカウントを増やす（closeShareDialogでは遷移前に中断されるため）
          state.count++;
          await setState(state);
          console.log(`[一括公開] 公開後の記事ページ - ${state.count}件目の公開完了！`);

          // 最大件数に達したかチェック
          if (state.maxCount > 0 && state.count >= state.maxCount) {
            alert(`一括公開完了！\n\n${state.count}件の記事を公開しました。`);
            await clearState();
            return;
          }

          console.log('[一括公開] 下書き一覧に戻ります');
          await sleep(1000);
          window.location.href = 'https://note.com/notes?status=draft';
          break;
        default:
          console.log('[一括公開] 未知のページです');
      }
    } catch (error) {
      console.error('[一括公開] エラー:', error.message);
      alert(`一括公開エラー: ${error.message}\n\n公開済み: ${state.count}件`);
      await clearState();
    }
  }

  // 開始ボタンを追加
  function addStartButton() {
    if (document.getElementById('note-bulk-publish-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'note-bulk-publish-btn';
    btn.innerHTML = '一括公開開始';
    btn.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10000;
      background: #41c9b4;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 25px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(65, 201, 180, 0.4);
    `;

    btn.addEventListener('click', async () => {
      const count = prompt('何件公開しますか？（0 = 全件）', '0');
      if (count === null) return;

      const maxCount = parseInt(count, 10) || 0;

      if (!confirm(`下書きを${maxCount === 0 ? '全件' : maxCount + '件'}公開します。\n\n処理中はブラウザを操作しないでください。\n\nよろしいですか？`)) {
        return;
      }

      await setState({ active: true, count: 0, maxCount: maxCount });
      btn.innerHTML = '処理中...';
      btn.disabled = true;

      await processCurrentPage();
    });

    // 停止ボタン
    const stopBtn = document.createElement('button');
    stopBtn.id = 'note-bulk-stop-btn';
    stopBtn.innerHTML = '停止';
    stopBtn.style.cssText = `
      position: fixed;
      top: 80px;
      right: 150px;
      z-index: 10000;
      background: #e74c3c;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 25px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.4);
    `;

    stopBtn.addEventListener('click', async () => {
      const state = await getState();
      await clearState();
      alert(`一括公開を停止しました。\n\n公開済み: ${state.count}件`);
      window.location.reload();
    });

    document.body.appendChild(btn);
    document.body.appendChild(stopBtn);
  }

  // 初期化
  async function init() {
    const page = getCurrentPage();
    console.log(`[一括公開] init: ページ = ${page}`);

    if (page === 'draft_list') {
      addStartButton();
    }

    // 自動処理が有効な場合は処理を続行
    const state = await getState();
    console.log(`[一括公開] init: 状態 =`, state);

    if (state.active) {
      // 最大件数に達したかチェック
      if (state.maxCount > 0 && state.count >= state.maxCount) {
        alert(`一括公開完了！\n\n${state.count}件の記事を公開しました。`);
        await clearState();
        return;
      }

      // 下書きがなくなったかチェック（下書き一覧ページの場合）
      if (page === 'draft_list') {
        setTimeout(async () => {
          const articles = document.querySelectorAll('[class*="article"], [class*="note"], [class*="item"], [class*="card"]');
          if (articles.length === 0) {
            alert(`一括公開完了！\n\n${state.count}件の記事を公開しました。\n（全ての下書きを公開しました）`);
            await clearState();
            return;
          }
          await processCurrentPage();
        }, 2000);
      } else {
        setTimeout(() => processCurrentPage(), 2000);
      }
    }
  }

  // ページ読み込み完了後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
