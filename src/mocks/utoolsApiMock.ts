/**
 * 完整的 uTools API Mock 实现
 * 基于官方 utools-api-types 提供标准化的 Mock 实现
 */

/**
 * Mock Display 接口实现
 */
export class MockDisplay {
  accelerometerSupport: 'available' | 'unavailable' | 'unknown' = 'available';
  bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  colorDepth = 24;
  colorSpace = 'srgb';
  depthPerComponent = 8;
  id = 1;
  internal = false;
  monochrome = false;
  rotation = 0;
  scaleFactor = 1.0;
  size = { width: 1920, height: 1080 };
  touchSupport: 'available' | 'unavailable' | 'unknown' = 'unavailable';
  workArea = { x: 0, y: 23, width: 1920, height: 1057 };
  workAreaSize = { width: 1920, height: 1057 };
}

/**
 * Mock DbStorage 实现
 */
export class MockDbStorage {
  private prefix: string;
  private initialData: Record<string, any>;

  constructor(prefix: string = 'utools_mock_', initialData: Record<string, any> = {}) {
    this.prefix = prefix;
    this.initialData = initialData;
    this.initializeData();
  }

  private initializeData() {
    // 初始化预设数据
    Object.entries(this.initialData).forEach(([key, value]) => {
      if (!localStorage.getItem(this.prefix + key)) {
        localStorage.setItem(this.prefix + key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
  }

  setItem(key: string, value: any): void {
    console.log(`[Mock] dbStorage.setItem('${key}', ${typeof value === 'object' ? JSON.stringify(value) : value})`);
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(this.prefix + key, serializedValue);
  }

  getItem(key: string): any {
    console.log(`[Mock] dbStorage.getItem('${key}')`);
    const value = localStorage.getItem(this.prefix + key);
    if (value === null) return null;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  removeItem(key: string): void {
    console.log(`[Mock] dbStorage.removeItem('${key}')`);
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    console.log('[Mock] dbStorage.clear()');
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  getAllKeys(): string[] {
    const keys = Object.keys(localStorage);
    return keys
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.replace(this.prefix, ''));
  }
}

/**
 * Mock Database 实现
 */
export class MockDatabase {
  private storage: Map<string, any> = new Map();
  private revCounter = 1;

  put(doc: { _id: string, _rev?: string, [key: string]: any }): { id: string, rev: string, ok: boolean } {
    console.log('[Mock] db.put()', doc);

    const id = doc._id;
    const rev = `${this.revCounter++}-mock${Date.now()}`;

    this.storage.set(id, { ...doc, _rev: rev });

    return { id, rev, ok: true };
  }

  get(id: string): any | null {
    console.log(`[Mock] db.get('${id}')`);
    return this.storage.get(id) || null;
  }

  remove(doc: string | { _id: string, _rev?: string }): { id: string, rev: string, ok: boolean } | { id: string, rev: string, ok: boolean, error: boolean, name: string, message: string } {
    const id = typeof doc === 'string' ? doc : doc._id;
    console.log(`[Mock] db.remove('${id}')`);

    if (this.storage.has(id)) {
      this.storage.delete(id);
      return { id, rev: `${this.revCounter++}-mock${Date.now()}`, ok: true };
    }

    return { id, rev: '', ok: false, error: true, name: 'not_found', message: 'Document not found' };
  }

  bulkDocs(docs: any[]): any[] {
    console.log('[Mock] db.bulkDocs()', docs);
    return docs.map(doc => this.put(doc));
  }

  allDocs(key?: string): any[] {
    console.log(`[Mock] db.allDocs(${key || 'all'})`);
    const results = Array.from(this.storage.values());

    if (key) {
      return results.filter(doc => doc._id.startsWith(key));
    }

    return results;
  }

  postAttachment(docId: string, attachment: Uint8Array, type: string): { id: string, rev: string, ok: boolean } {
    console.log(`[Mock] db.postAttachment('${docId}', attachment, '${type}')`);

    const attachmentDoc = {
      _id: `${docId}_attachment`,
      _attachment: attachment,
      _attachmentType: type,
      _rev: `${this.revCounter++}-mock${Date.now()}`
    };

    this.storage.set(attachmentDoc._id, attachmentDoc);

    return { id: docId, rev: attachmentDoc._rev, ok: true };
  }

  getAttachment(docId: string): Uint8Array | null {
    console.log(`[Mock] db.getAttachment('${docId}')`);
    const doc = this.storage.get(`${docId}_attachment`);
    return doc?._attachment || null;
  }

  getAttachmentType(docId: string): string | null {
    console.log(`[Mock] db.getAttachmentType('${docId}')`);
    const doc = this.storage.get(`${docId}_attachment`);
    return doc?._attachmentType || null;
  }

  replicateStateFromCloud(): null | 0 | 1 {
    console.log('[Mock] db.replicateStateFromCloud()');
    return 0; // 已完成复制
  }

  // Promise 版本的方法
  promises = {
    put: (doc: any) => Promise.resolve(this.put(doc)),
    get: (id: string) => Promise.resolve(this.get(id)),
    remove: (doc: any) => Promise.resolve(this.remove(doc)),
    bulkDocs: (docs: any[]) => Promise.resolve(this.bulkDocs(docs)),
    allDocs: (key?: string) => Promise.resolve(this.allDocs(key)),
    postAttachment: (docId: string, attachment: Uint8Array, type: string) =>
      Promise.resolve(this.postAttachment(docId, attachment, type)),
    getAttachment: (docId: string) => Promise.resolve(this.getAttachment(docId)),
    getAttachmentType: (docId: string) => Promise.resolve(this.getAttachmentType(docId)),
    replicateStateFromCloud: () => Promise.resolve(this.replicateStateFromCloud())
  };
}

/**
 * Mock UBrowser 实现
 */
export class MockUBrowser {
  private currentUrl: string = '';
  private currentUserAgent: string = 'Mozilla/5.0 (Mock Browser)';
  private currentViewport = { width: 1200, height: 800 };
  private isVisible: boolean = true;

  useragent(userAgent: string): this {
    console.log(`[Mock] ubrowser.useragent('${userAgent}')`);
    this.currentUserAgent = userAgent;
    return this;
  }

  goto(url: string, headers?: { Referer: string, userAgent: string }, timeout?: number): this {
    console.log(`[Mock] ubrowser.goto('${url}')`, { headers, timeout });
    this.currentUrl = url;
    return this;
  }

  viewport(width: number, height: number): this {
    console.log(`[Mock] ubrowser.viewport(${width}, ${height})`);
    this.currentViewport = { width, height };
    return this;
  }

  hide(): this {
    console.log('[Mock] ubrowser.hide()');
    this.isVisible = false;
    return this;
  }

  show(): this {
    console.log('[Mock] ubrowser.show()');
    this.isVisible = true;
    return this;
  }

  css(css: string): this {
    console.log('[Mock] ubrowser.css()', css);
    return this;
  }

  press(key: string, ...modifier: ('control' | 'ctrl' | 'shift' | 'meta' | 'alt' | 'command' | 'cmd')[]): this {
    console.log(`[Mock] ubrowser.press('${key}')`, modifier);
    return this;
  }

  paste(text?: string): this {
    console.log(`[Mock] ubrowser.paste('${text || ''}')`);
    return this;
  }

  screenshot(arg?: string | { x: number, y: number, width: number, height: number }, savePath?: string): this {
    console.log('[Mock] ubrowser.screenshot()', { arg, savePath });
    return this;
  }

  pdf(options?: any, savePath?: string): this {
    console.log('[Mock] ubrowser.pdf()', { options, savePath });
    return this;
  }

  device(arg: any): this {
    console.log('[Mock] ubrowser.device()', arg);
    return this;
  }

  cookies(name?: string): this {
    console.log(`[Mock] ubrowser.cookies('${name || 'all'}')`);
    return this;
  }

  setCookies(name: string | { name: string, value: string }[], value?: string): this {
    console.log('[Mock] ubrowser.setCookies()', { name, value });
    return this;
  }

  removeCookies(name: string): this {
    console.log(`[Mock] ubrowser.removeCookies('${name}')`);
    return this;
  }

  clearCookies(url?: string): this {
    console.log(`[Mock] ubrowser.clearCookies('${url || ''}')`);
    return this;
  }

  devTools(mode?: 'right' | 'bottom' | 'undocked' | 'detach'): this {
    console.log(`[Mock] ubrowser.devTools('${mode || 'right'}')`);
    return this;
  }

  evaluate(func: (...params: any[]) => any, ...params: any[]): this {
    console.log('[Mock] ubrowser.evaluate()', { func: func.toString(), params });
    return this;
  }

  wait(ms: number): this;
  wait(selector: string, timeout?: number): this;
  wait(func: (...params: any[]) => boolean, timeout?: number, ...params: any[]): this;
  wait(arg: any, timeout?: number, ...params: any[]): this {
    console.log('[Mock] ubrowser.wait()', { arg, timeout, params });
    return this;
  }

  when(selector: string): this;
  when(func: (...params: any[]) => boolean, ...params: any[]): this;
  when(arg: any, ...params: any[]): this {
    console.log('[Mock] ubrowser.when()', { arg, params });
    return this;
  }

  end(): this {
    console.log('[Mock] ubrowser.end()');
    return this;
  }

  click(selector: string): this {
    console.log(`[Mock] ubrowser.click('${selector}')`);
    return this;
  }

  mousedown(selector: string): this {
    console.log(`[Mock] ubrowser.mousedown('${selector}')`);
    return this;
  }

  mouseup(selector: string): this {
    console.log(`[Mock] ubrowser.mouseup('${selector}')`);
    return this;
  }

  file(selector: string, payload: string | string[] | Uint8Array): this {
    console.log(`[Mock] ubrowser.file('${selector}')`, payload);
    return this;
  }

  value(selector: string, value: string): this {
    console.log(`[Mock] ubrowser.value('${selector}', '${value}')`);
    return this;
  }

  check(selector: string, checked: boolean): this {
    console.log(`[Mock] ubrowser.check('${selector}', ${checked})`);
    return this;
  }

  focus(selector: string): this {
    console.log(`[Mock] ubrowser.focus('${selector}')`);
    return this;
  }

  scroll(selector: string): this;
  scroll(y: number): this;
  scroll(x: number, y: number): this;
  scroll(arg1: any, arg2?: number): this {
    console.log('[Mock] ubrowser.scroll()', { arg1, arg2 });
    return this;
  }

  run(ubrowserId: number): Promise<any[]>;
  run(options: any): Promise<any[]>;
  run(arg: any): Promise<any[]> {
    console.log('[Mock] ubrowser.run()', arg);
    return Promise.resolve(['Mock ubrowser execution result']);
  }
}
