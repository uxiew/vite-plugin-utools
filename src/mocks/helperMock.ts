import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const utoolsApiMockScript = () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Resolve path to the bundled utoolsApiMockImpl.mjs
    // We assume it's in the same directory as the plugin entry point (dist)
    const utoolsMockImplPath = resolve(__dirname, 'utoolsApiMockImpl.mjs').split(path.sep).join('/')
    return `// Inject uTools api mock
    import { MockUToolsApi } from "${utoolsMockImplPath}"
    if (!window.utools) {
        window.utools = new MockUToolsApi();
        window.$isMockDev = true;
        console.log('[uTools Mock] --- Inject uTools api mock ---', window.utools);
    }
    `
}

export const mockBadgeScript = (globalName: string) => `
// Debug Badge
const badge = document.createElement('div');
badge.className = 'utools-mock-badge';
badge.textContent = 'uTools Mock';
badge.title = 'Click to log preload exports to console';
badge.onclick = () => {
    console.group('uTools Mock Debug');
    console.log('window.preload:', window['${globalName}']);
    console.log('window.utools:', window.utools);
    console.groupEnd();
};
document.body.appendChild(badge);

window.__utools__mock__flash = () => {
    badge.classList.add('active');
    setTimeout(() => {
        badge.classList.remove('active');
    }, 200);
}
`

export const mockWrapperScript = `function wrapMockFunctions(obj, path = '') {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (const key in obj) {
        const value = obj[key];
        const currentPath = path ? \`\${path}.\${key}\` : key;
        
        if (typeof value === 'function') {
            obj[key] = function(...args) {
                console.group(\`[uTools Mock] \${currentPath}\`);
                console.log('Arguments:', args);
                try {
                    const result = value.apply(this, args);
                    console.log('Result:', result);
                    console.groupEnd();
                    if (window.__utools__mock__flash) {
                        window.__utools__mock__flash();
                    }
                    return result;
                } catch (error) {
                    console.error('Error:', error);
                    console.groupEnd();
                    if (window.__utools__mock__flash) {
                        window.__utools__mock__flash();
                    }
                    throw error;
                }
            }
        } else if (typeof value === 'object') {
            wrapMockFunctions(value, currentPath);
        }
    }
    return obj;
}
`

export const mockBadgeStyle = `
    .utools-mock-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        z-index: 9999;
        user-select: none;
        font-family: system-ui, -apple-system, sans-serif;
        transition: all 0.2s;
        border: 1px solid transparent;
    }
    .utools-mock-badge:hover {
        background: rgba(0, 0, 0, 0.9);
    }
    .utools-mock-badge.active {
        background: rgba(22, 163, 74, 0.9);
        transform: scale(1.1);
        border-color: rgba(255, 255, 255, 0.5);
        box-shadow: 0 0 10px rgba(22, 163, 74, 0.5);
    }
`