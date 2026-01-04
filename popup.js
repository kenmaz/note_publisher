// note.com 下書き一括公開 - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');

  // 現在のタブがnote.comかどうかをチェック
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url) {
      if (currentTab.url.includes('note.com/notes') && currentTab.url.includes('status=draft')) {
        statusDiv.className = 'status success';
        statusDiv.textContent = '下書き一覧ページで「一括公開」ボタンが使えます！';
      }
    }
  });
});
