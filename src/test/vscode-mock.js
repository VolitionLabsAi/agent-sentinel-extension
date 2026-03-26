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

const vscodeMock = {
    EventEmitter: MockEventEmitter,
    Uri: MockUri,
    TreeItem: MockTreeItem,
    ThemeIcon: MockThemeIcon,
    ThemeColor: MockThemeColor,
    MarkdownString: MockMarkdownString,
    TreeItemCollapsibleState,
    Disposable: {
        from: (...disposables) => ({
            dispose: () => disposables.forEach(d => d.dispose()),
        }),
    },
    window: {
        tabGroups: {
            all: [],
            onDidChangeTabs: () => ({ dispose: () => {} }),
        },
    },
    workspace: {
        getConfiguration: () => ({
            get: () => undefined,
        }),
    },
    extensions: {
        getExtension: () => undefined,
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
