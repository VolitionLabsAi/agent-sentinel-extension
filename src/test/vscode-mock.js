/**
 * Minimal mock of the `vscode` module for unit testing.
 * Required before test files load to provide the vscode module
 * that's normally only available inside VS Code's extension host.
 */
'use strict';

class MockEventEmitter {
    constructor() {
        this.listeners = [];
        this.event = (listener) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    const idx = this.listeners.indexOf(listener);
                    if (idx >= 0) {
                        this.listeners.splice(idx, 1);
                    }
                },
            };
        };
    }

    fire(data) {
        for (const listener of this.listeners) {
            listener(data);
        }
    }

    dispose() {
        this.listeners = [];
    }
}

class MockUri {
    constructor(fsPath) {
        this.fsPath = fsPath;
    }
    static file(path) {
        return new MockUri(path);
    }
}

class MockTreeItem {
    constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? 0;
    }
}

class MockThemeIcon {
    constructor(id, color) {
        this.id = id;
        this.color = color;
    }
}

class MockThemeColor {
    constructor(id) {
        this.id = id;
    }
}

class MockMarkdownString {
    constructor(value) {
        this.value = value ?? '';
    }
}

const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
};

const StatusBarAlignment = {
    Left: 1,
    Right: 2,
};

class MockStatusBarItem {
    constructor(alignment, priority) {
        this.alignment = alignment;
        this.priority = priority;
        this.text = '';
        this.tooltip = undefined;
        this.color = undefined;
        this.backgroundColor = undefined;
        this.command = undefined;
        this._visible = false;
    }
    show() { this._visible = true; }
    hide() { this._visible = false; }
    dispose() { this._visible = false; }
}

// Mutable config store for tests to override
const _configStore = {};

const vscodeMock = {
    EventEmitter: MockEventEmitter,
    Uri: MockUri,
    TreeItem: MockTreeItem,
    ThemeIcon: MockThemeIcon,
    ThemeColor: MockThemeColor,
    MarkdownString: MockMarkdownString,
    TreeItemCollapsibleState,
    StatusBarAlignment,
    Disposable: {
        from: (...disposables) => ({
            dispose: () => disposables.forEach(d => d.dispose()),
        }),
    },
    commands: {
        registerCommand: (id, handler) => {
            // Store handler for potential invocation in tests
            return { dispose: () => {} };
        },
    },
    window: {
        tabGroups: {
            all: [],
            onDidChangeTabs: () => ({ dispose: () => {} }),
        },
        createStatusBarItem: (alignment, priority) => new MockStatusBarItem(alignment, priority),
    },
    workspace: {
        getConfiguration: (section) => ({
            get: (key, defaultValue) => {
                const fullKey = section ? `${section}.${key}` : key;
                return fullKey in _configStore ? _configStore[fullKey] : defaultValue;
            },
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        workspaceFolders: undefined,
    },
    extensions: {
        getExtension: () => undefined,
    },
    // Expose config store for tests to manipulate
    _test: {
        configStore: _configStore,
        MockStatusBarItem,
    },
};

// Register in require.cache so `require('vscode')` returns the mock
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'vscode') {
        return 'vscode';
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: vscodeMock,
    paths: [],
    children: [],
    path: '',
};
