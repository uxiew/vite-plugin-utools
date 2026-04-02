/**
 * 完整的 UToolsApi Mock 实现
 * 基于 utools.d.ts 中的 UToolsApi 接口
 */

import { MockDisplay, MockDbStorage, MockDatabase, MockUBrowser } from './utoolsApiMock';

// 重新导出这些类以供外部使用
export { MockDisplay, MockDbStorage, MockDatabase, MockUBrowser };

// 使用 any 类型避免 TypeScript DOM 类型检查错误
const mockWindow = (globalThis as any)?.window || (globalThis as any) || {};
const mockDocument = mockWindow?.document || {};
const mockNavigator = mockWindow?.navigator || {};
const mockProcess = (globalThis as any)?.process || { env: {} };

/**
 * 完整的 UToolsApi Mock 实现类
 */
export class MockUToolsApi {
  public db: MockDatabase;
  public dbStorage: MockDbStorage;
  public ubrowser: MockUBrowser;

  private callbacks: {
    onPluginReady: (() => void)[];
    onPluginEnter: ((action: { code: string, type: string, payload: any }) => void)[];
    onPluginOut: ((processExit: boolean) => void)[];
    onPluginDetach: (() => void)[];
    onDbPull: ((docs: { _id: string, _rev: string }[]) => void)[];
  } = {
      onPluginReady: [],
      onPluginEnter: [],
      onPluginOut: [],
      onPluginDetach: [],
      onDbPull: []
    };

  constructor(config?: {
    dbStoragePrefix?: string;
    dbStorageInitialData?: Record<string, any>;
  }) {
    this.db = new MockDatabase();
    this.dbStorage = new MockDbStorage(
      config?.dbStoragePrefix || 'utools_mock_',
      config?.dbStorageInitialData || {}
    );
    this.ubrowser = new MockUBrowser();

    // 模拟插件生命周期
    this.simulatePluginLifecycle();
  }

  private simulatePluginLifecycle() {
    // 模拟插件准备就绪
    setTimeout(() => {
      this.callbacks.onPluginReady.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('[Mock] onPluginReady callback error:', error);
        }
      });
    }, 100);

    // 模拟插件进入
    setTimeout(() => {
      this.callbacks.onPluginEnter.forEach(callback => {
        try {
          callback({
            code: 'mock_feature',
            type: 'text',
            payload: 'Mock payload'
          });
        } catch (error) {
          console.error('[Mock] onPluginEnter callback error:', error);
        }
      });
    }, 200);
  }

  // 生命周期回调方法
  onPluginReady(callback: () => void): void {
    console.log('[Mock] utools.onPluginReady() registered');
    this.callbacks.onPluginReady.push(callback);
  }

  onPluginEnter(callback: (action: { code: string, type: string, payload: any }) => void): void {
    console.log('[Mock] utools.onPluginEnter() registered');
    this.callbacks.onPluginEnter.push(callback);
  }

  onPluginOut(callback: (processExit: boolean) => void): void {
    console.log('[Mock] utools.onPluginOut() registered');
    this.callbacks.onPluginOut.push(callback);
    // 监听页面卸载事件
    if (mockWindow.addEventListener) {
      mockWindow.addEventListener('beforeunload', () => callback(false));
    }
  }

  onPluginDetach(callback: () => void): void {
    console.log('[Mock] utools.onPluginDetach() registered');
    this.callbacks.onPluginDetach.push(callback);
    if (mockWindow.addEventListener) {
      mockWindow.addEventListener('beforeunload', callback);
    }
  }

  onDbPull(callback: (docs: { _id: string, _rev: string }[]) => void): void {
    console.log('[Mock] utools.onDbPull() registered');
    this.callbacks.onDbPull.push(callback);
  }

  // 窗口控制方法
  hideMainWindow(isRestorePreWindow?: boolean): boolean {
    console.log(`[Mock] utools.hideMainWindow(${isRestorePreWindow})`);
    return true;
  }

  showMainWindow(): boolean {
    console.log('[Mock] utools.showMainWindow()');
    return true;
  }

  setExpendHeight(height: number): boolean {
    console.log(`[Mock] utools.setExpendHeight(${height})`);
    const app = mockDocument.getElementById?.('app') || mockDocument.body;
    if (app && app.style) {
      app.style.height = `${height}px`;
    }
    return true;
  }

  // 子输入框方法
  setSubInput(onChange: (value: { text: string }) => void, placeholder?: string, isFocus?: boolean): boolean {
    console.log(`[Mock] utools.setSubInput(placeholder: '${placeholder}', isFocus: ${isFocus})`);
    // 模拟子输入框变化
    setTimeout(() => {
      onChange({ text: 'Mock sub input text' });
    }, 1000);
    return true;
  }

  removeSubInput(): boolean {
    console.log('[Mock] utools.removeSubInput()');
    return true;
  }

  setSubInputValue(value: string): boolean {
    console.log(`[Mock] utools.setSubInputValue('${value}')`);
    return true;
  }

  subInputFocus(): boolean {
    console.log('[Mock] utools.subInputFocus()');
    return true;
  }

  subInputSelect(): boolean {
    console.log('[Mock] utools.subInputSelect()');
    return true;
  }

  subInputBlur(): boolean {
    console.log('[Mock] utools.subInputBlur()');
    return true;
  }

  // 窗口创建方法
  createBrowserWindow(url: string, options: { width?: number, height?: number }, callback?: () => void): any {
    console.log(`[Mock] utools.createBrowserWindow('${url}')`, options);
    const mockWindow = {
      id: Math.floor(Math.random() * 10000),
      webContents: {
        id: Math.floor(Math.random() * 10000)
      }
    };

    if (callback) {
      setTimeout(callback, 100);
    }

    return mockWindow;
  }

  outPlugin(): boolean {
    console.log('[Mock] utools.outPlugin()');
    this.callbacks.onPluginOut.forEach(callback => {
      try {
        callback(false);
      } catch (error) {
        console.error('[Mock] onPluginOut callback error:', error);
      }
    });
    return true;
  }

  // 系统信息方法
  isDarkColors(): boolean {
    const isDark = mockWindow.matchMedia && mockWindow.matchMedia('(prefers-color-scheme: dark)').matches;
    console.log(`[Mock] utools.isDarkColors() -> ${isDark}`);
    return isDark;
  }

  getUser(): { avatar: string, nickname: string, type: string } | null {
    console.log('[Mock] utools.getUser()');
    return {
      avatar: 'https://via.placeholder.com/64x64.png?text=Mock',
      nickname: 'Mock User',
      type: 'mock'
    };
  }

  fetchUserServerTemporaryToken(): Promise<{ token: string, expiredAt: number }> {
    console.log('[Mock] utools.fetchUserServerTemporaryToken()');
    return Promise.resolve({
      token: 'mock_token_' + Date.now(),
      expiredAt: Date.now() + 3600000 // 1小时后过期
    });
  }

  // 支付相关方法
  openPayment(options: {
    goodsId: string,
    outOrderId?: string,
    attach?: string
  }, callback?: () => void): void {
    console.log('[Mock] utools.openPayment()', options);
    if (callback) {
      setTimeout(callback, 2000); // 模拟支付成功
    }
  }

  fetchUserPayments(): Promise<any[]> {
    console.log('[Mock] utools.fetchUserPayments()');
    return Promise.resolve([
      {
        order_id: 'mock_order_' + Date.now(),
        total_fee: 100,
        body: 'Mock Payment',
        attach: 'mock_attach',
        goods_id: 'mock_goods',
        out_order_id: 'mock_out_order',
        paid_at: new Date().toISOString()
      }
    ]);
  }

  // 功能管理方法
  setFeature(feature: {
    code: string,
    explain: string,
    platform: ('darwin' | 'win32' | 'linux') | (Array<'darwin' | 'win32' | 'linux'>),
    icon?: string,
    cmds: (string | {
      type: 'img' | 'files' | 'regex' | 'over' | 'window',
      label: string
    })[]
  }): boolean {
    console.log('[Mock] utools.setFeature()', feature);
    return true;
  }

  removeFeature(code: string): boolean {
    console.log(`[Mock] utools.removeFeature('${code}')`);
    return true;
  }

  getFeatures(codes?: string[]): any[] {
    console.log(`[Mock] utools.getFeatures(${codes ? codes.join(', ') : 'all'})`);
    return [
      {
        code: 'mock_feature',
        explain: 'Mock Feature',
        platform: ['darwin', 'win32', 'linux'],
        cmds: ['mock']
      }
    ];
  }

  // 跳转方法
  redirect(label: string, payload: string | { type: 'text' | 'img' | 'files', data: any }): void {
    console.log(`[Mock] utools.redirect('${label}')`, payload);
  }

  // UBrowser 管理方法
  getIdleUBrowsers(): { id: number, title: string, url: string }[] {
    console.log('[Mock] utools.getIdleUBrowsers()');
    return [
      { id: 1, title: 'Mock Browser 1', url: 'https://example.com' },
      { id: 2, title: 'Mock Browser 2', url: 'https://mock.com' }
    ];
  }

  setUBrowserProxy(config: { pacScript?: string, proxyRules?: string, proxyBypassRules?: string }): boolean {
    console.log('[Mock] utools.setUBrowserProxy()', config);
    return true;
  }

  clearUBrowserCache(): boolean {
    console.log('[Mock] utools.clearUBrowserCache()');
    return true;
  }

  // 通知方法
  showNotification(body: string): void {
    console.log(`[Mock] utools.showNotification('${body}')`);
    const Notification = mockWindow.Notification;
    if (Notification) {
      if (Notification.permission === 'granted') {
        new Notification('uTools Mock', { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission: any) => {
          if (permission === 'granted') {
            new Notification('uTools Mock', { body });
          }
        });
      }
    }
  }

  // 文件对话框方法
  showOpenDialog(options: {
    title?: string,
    defaultPath?: string,
    buttonLabel?: string,
    filters?: { name: string, extensions: string[] }[],
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>,
    message?: string,
    securityScopedBookmarks?: boolean
  }): string[] | undefined {
    console.log('[Mock] utools.showOpenDialog()', options);
    return ['/mock/selected/file.txt', '/mock/selected/file2.txt'];
  }

  showSaveDialog(options: {
    title?: string,
    defaultPath?: string,
    buttonLabel?: string,
    filters?: { name: string, extensions: string[] }[],
    message?: string,
    nameFieldLabel?: string,
    showsTagField?: string,
    properties?: Array<'showHiddenFiles' | 'createDirectory' | 'treatPackageAsDirectory' | 'showOverwriteConfirmation' | 'dontAddToRecent'>,
    securityScopedBookmarks?: boolean
  }): string | undefined {
    console.log('[Mock] utools.showSaveDialog()', options);
    return '/mock/save/file.txt';
  }

  // 页面查找方法
  findInPage(text: string, options?: {
    forward?: boolean,
    findNext?: boolean,
    matchCase?: boolean,
    wordStart?: boolean,
    medialCapitalAsWordStart?: boolean
  }): void {
    console.log(`[Mock] utools.findInPage('${text}')`, options);
  }

  stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void {
    console.log(`[Mock] utools.stopFindInPage('${action}')`);
  }

  // 拖拽方法
  startDrag(file: string | string[]): void {
    console.log('[Mock] utools.startDrag()', file);
  }

  // 屏幕操作方法
  screenColorPick(callback: (color: { hex: string, rgb: string }) => void): void {
    console.log('[Mock] utools.screenColorPick()');
    setTimeout(() => {
      callback({
        hex: '#FF6B6B',
        rgb: 'rgb(255, 107, 107)'
      });
    }, 1000);
  }

  screenCapture(callback: (imgBase64: string) => void): void {
    console.log('[Mock] utools.screenCapture()');
    setTimeout(() => {
      // 返回一个小的透明 PNG 的 base64
      callback('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    }, 1000);
  }

  // 系统信息方法
  getNativeId(): string {
    const id = 'mock_native_id_' + Date.now();
    console.log(`[Mock] utools.getNativeId() -> ${id}`);
    return id;
  }

  getAppVersion(): string {
    const version = '3.0.0-mock';
    console.log(`[Mock] utools.getAppVersion() -> ${version}`);
    return version;
  }

  getPath(name: 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'logs' | 'pepperFlashSystemPlugin'): string {
    const paths: Record<string, string> = {
      home: '/mock/home',
      appData: '/mock/appData',
      userData: '/mock/userData',
      cache: '/mock/cache',
      temp: '/mock/temp',
      exe: '/mock/exe',
      module: '/mock/module',
      desktop: '/mock/desktop',
      documents: '/mock/documents',
      downloads: '/mock/downloads',
      music: '/mock/music',
      pictures: '/mock/pictures',
      videos: '/mock/videos',
      logs: '/mock/logs',
      pepperFlashSystemPlugin: '/mock/pepperFlashSystemPlugin'
    };

    const path = paths[name] || '/mock/unknown';
    console.log(`[Mock] utools.getPath('${name}') -> ${path}`);
    return path;
  }

  getFileIcon(filePath: string): string {
    console.log(`[Mock] utools.getFileIcon('${filePath}')`);
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  // 剪贴板操作方法
  copyFile(file: string | string[]): boolean {
    console.log('[Mock] utools.copyFile()', file);
    return true;
  }

  copyImage(img: string | Uint8Array): boolean {
    console.log('[Mock] utools.copyImage()', typeof img === 'string' ? 'base64/path' : 'Uint8Array');
    return true;
  }

  copyText(text: string): boolean {
    console.log(`[Mock] utools.copyText('${text}')`);
    if (mockNavigator.clipboard) {
      mockNavigator.clipboard.writeText(text).catch((err: any) => {
        console.warn('[Mock] Failed to copy text to clipboard:', err);
      });
    }
    return true;
  }

  getCopyedFiles(): { isFile: boolean, isDirectory: boolean, name: string, path: string }[] {
    console.log('[Mock] utools.getCopyedFiles()');
    return [
      {
        isFile: true,
        isDirectory: false,
        name: 'mock-file.txt',
        path: '/mock/copied/mock-file.txt'
      },
      {
        isFile: false,
        isDirectory: true,
        name: 'mock-folder',
        path: '/mock/copied/mock-folder'
      }
    ];
  }

  // 系统交互方法
  readCurrentFolderPath(): Promise<string> {
    console.log('[Mock] utools.readCurrentFolderPath()');
    return Promise.resolve('/mock/current/folder');
  }

  readCurrentBrowserUrl(): Promise<string> {
    console.log('[Mock] utools.readCurrentBrowserUrl()');
    return Promise.resolve('https://mock-browser-url.com');
  }

  // Shell 操作方法
  shellOpenPath(fullPath: string): void {
    console.log(`[Mock] utools.shellOpenPath('${fullPath}')`);
  }

  shellShowItemInFolder(fullPath: string): void {
    console.log(`[Mock] utools.shellShowItemInFolder('${fullPath}')`);
  }

  shellOpenExternal(url: string): void {
    console.log(`[Mock] utools.shellOpenExternal('${url}')`);
    if (mockWindow.open) {
      mockWindow.open(url, '_blank');
    }
  }

  shellBeep(): void {
    console.log('[Mock] utools.shellBeep()');
    // 尝试播放系统提示音
    try {
      const Audio = mockWindow.Audio;
      if (Audio) {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
        audio.play().catch(() => {
          // 如果无法播放音频，则忽略
        });
      }
    } catch (error) {
      // 忽略音频播放错误
    }
  }

  hideMainWindowTypeString(str: string): void {
    console.log(`[Mock] utools.hideMainWindowTypeString('${str}')`);
    this.hideMainWindow();
  }

  // 模拟输入方法
  simulateKeyboardTap(key: string, ...modifier: ('control' | 'ctrl' | 'shift' | 'option' | 'alt' | 'command' | 'super')[]): void {
    console.log(`[Mock] utools.simulateKeyboardTap('${key}')`, modifier);
  }

  simulateMouseClick(x?: number, y?: number): void {
    console.log(`[Mock] utools.simulateMouseClick(${x || 'current'}, ${y || 'current'})`);
  }

  simulateMouseRightClick(x?: number, y?: number): void {
    console.log(`[Mock] utools.simulateMouseRightClick(${x || 'current'}, ${y || 'current'})`);
  }

  simulateMouseDoubleClick(x?: number, y?: number): void {
    console.log(`[Mock] utools.simulateMouseDoubleClick(${x || 'current'}, ${y || 'current'})`);
  }

  simulateMouseMove(x: number, y: number): void {
    console.log(`[Mock] utools.simulateMouseMove(${x}, ${y})`);
  }

  getCursorScreenPoint(): { x: number, y: number } {
    const point = { x: 100, y: 100 };
    console.log(`[Mock] utools.getCursorScreenPoint() -> ${JSON.stringify(point)}`);
    return point;
  }

  // 显示器相关方法
  getPrimaryDisplay(): MockDisplay {
    console.log('[Mock] utools.getPrimaryDisplay()');
    return new MockDisplay();
  }

  getAllDisplays(): MockDisplay[] {
    console.log('[Mock] utools.getAllDisplays()');
    return [new MockDisplay()];
  }

  getDisplayNearestPoint(point: { x: number, y: number }): MockDisplay {
    console.log(`[Mock] utools.getDisplayNearestPoint(${JSON.stringify(point)})`);
    return new MockDisplay();
  }

  getDisplayMatching(rect: { x: number, y: number, width: number, height: number }): MockDisplay {
    console.log(`[Mock] utools.getDisplayMatching(${JSON.stringify(rect)})`);
    return new MockDisplay();
  }

  // 录屏相关方法
  desktopCaptureSources(options: { types: string[], thumbnailSize?: { width: number, height: number }, fetchWindowIcons?: boolean }): Promise<any[]> {
    console.log('[Mock] utools.desktopCaptureSources()', options);
    return Promise.resolve([
      {
        appIcon: {},
        display_id: 'mock_display_1',
        id: 'mock_source_1',
        name: 'Mock Screen 1',
        thumbnail: {}
      }
    ]);
  }

  // 平台检测方法
  isDev(): boolean {
    const isDev = mockProcess.env.NODE_ENV === 'development';
    console.log(`[Mock] utools.isDev() -> ${isDev}`);
    return isDev;
  }

  isMacOS(): boolean {
    const platform = mockNavigator.platform || '';
    const isMac = platform.toUpperCase().indexOf('MAC') >= 0;
    console.log(`[Mock] utools.isMacOS() -> ${isMac}`);
    return isMac;
  }

  isWindows(): boolean {
    const platform = mockNavigator.platform || '';
    const isWin = platform.toUpperCase().indexOf('WIN') >= 0;
    console.log(`[Mock] utools.isWindows() -> ${isWin}`);
    return isWin;
  }

  isLinux(): boolean {
    const platform = mockNavigator.platform || '';
    const isLinux = platform.toUpperCase().indexOf('LINUX') >= 0;
    console.log(`[Mock] utools.isLinux() -> ${isLinux}`);
    return isLinux;
  }
}
