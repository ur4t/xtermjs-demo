import { ITerminalOptions, ITerminalAddon, ITheme, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { SerializeAddon } from 'xterm-addon-serialize';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { Unicode11Addon } from 'xterm-addon-unicode11';

import 'xterm/css/xterm.css'
import './index.css'

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const path = window.location.pathname.replace(/[\/]+$/, '');
const wsUrl = [protocol, '//', window.location.host, path, '/tty', window.location.search].join('');

const darkTheme: ITheme = {
    foreground: "#CCCCCC",
    background: "#0C0C0C",
    cursor: "#6C6C6C",
    black: "#0C0C0C",
    red: "#E45649",
    green: "#50A14F",
    yellow: "#C18301",
    blue: "#0184BC",
    magenta: "#A626A4",
    cyan: "#0997B3",
    white: "#CCCCCC",
    brightBlack: "#60626D",
    brightRed: "#DF6C75",
    brightGreen: "#98C379",
    brightYellow: "#E4C07A",
    brightBlue: "#61AFEF",
    brightMagenta: "#C577DD",
    brightCyan: "#56B5C1",
    brightWhite: "#EEEEEE"
};

const lightTheme: ITheme = {
    foreground: "#60626D",
    background: "#EEEEEE",
    cursor: "#AAAAAA",
    black: "#EEEEEE",
    red: "#E45649",
    green: "#50A14F",
    yellow: "#C18301",
    blue: "#0184BC",
    magenta: "#A626A4",
    cyan: "#0997B3",
    white: "#60626D",
    brightBlack: "#CCCCCC",
    brightRed: "#DF6C75",
    brightGreen: "#98C379",
    brightYellow: "#E4C07A",
    brightBlue: "#61AFEF",
    brightMagenta: "#C577DD",
    brightCyan: "#56B5C1",
    brightWhite: "#0C0C0C"
};

const termOptions: ITerminalOptions = {
    fontSize: 15,
    fontFamily: 'Sarasa Fixed SC, Menlo For Powerline, Consolas, Liberation Mono, Menlo, Courier, monospace',
};

class NotifyAddon implements ITerminalAddon {
    private terminal: Terminal;
    private node: HTMLElement;
    private timeout: number;

    constructor() {
        this.node = document.createElement('div');
        this.node.className = 'notify-addon';
        this.node.addEventListener(
            'mousedown',
            (event) => {
                event.preventDefault();
                event.stopPropagation();
            },
            true
        );
    }

    activate(terminal: Terminal): void {
        this.terminal = terminal;
    }

    dispose(): void { }

    notify(msg: string, timeout?: number): void {
        const { terminal, node } = this;

        node.textContent = msg;

        if (!node.parentNode) {
            terminal.element.appendChild(node);
        }

        const parentSize = node.parentElement.getBoundingClientRect();
        const nodeSize = node.getBoundingClientRect();

        node.style.top = (parentSize.height - nodeSize.height) / 2 + 'px';
        node.style.left = (parentSize.width - nodeSize.width) / 2 + 'px';

        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        if (timeout === null) {
            return;
        }
        this.timeout = setTimeout(() => {
            node.style.opacity = '0';
            this.timeout = setTimeout(() => {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
                this.timeout = null;
                node.style.opacity = '0.75';
            }, 200) as any;
        }, timeout || 500) as any;
    }
}

const terminal: Terminal = new Terminal(termOptions);
const fitAddon: FitAddon = new FitAddon();
const searchAddon: SearchAddon = new SearchAddon();
const serializeAddon: SerializeAddon = new SerializeAddon();
const notifyAddon: NotifyAddon = new NotifyAddon();
const socket: WebSocket = new WebSocket(wsUrl);

const container: HTMLElement = document.createElement('div');
container.className = 'terminal-container';
document.body.appendChild(container);

let resizeTimeout: number;

function windowResizeListener() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => fitAddon.fit(), 250) as any;
}

function windowUnloadListener(_event: Event) {
    socket.close();
    terminal.dispose();
    window.removeEventListener('resize', windowResizeListener);
    window.removeEventListener('beforeunload', windowUnloadListener);
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', darkModeListener);
}

function darkModeListener() {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        terminal.setOption('theme', darkTheme);
    } else {
        terminal.setOption('theme', lightTheme);
    }
    terminal.refresh(0, terminal.rows - 1);
}

terminal.open(container);
terminal.loadAddon(fitAddon);
terminal.loadAddon(serializeAddon);
terminal.loadAddon(notifyAddon);
terminal.loadAddon(searchAddon);
terminal.loadAddon(new WebLinksAddon());
terminal.loadAddon(new Unicode11Addon());
if (window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2')) {
    terminal.loadAddon(new WebglAddon());
} else {
    console.log('WebGL renderer unavailable.');
}

enum msgHeader {
    INPUT = 0xfa,
    RESIZE = 0xfb,
    CONNECT = 0xfc,
}

terminal.onData((data: string) => {
    socket.send(String.fromCharCode(msgHeader.INPUT) + data);
});
terminal.onTitleChange((data: string) => {
    if (data && data !== '') {
        document.title = data;
    }
});
terminal.onResize((size: { cols: number; rows: number }) => {
    // we assume numbers less than 0xff
    socket.send(String.fromCharCode(msgHeader.RESIZE, size.cols, size.rows));
    notifyAddon.notify(`${size.cols}x${size.rows}`)
});
terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.key === ',' && event.ctrlKey) {
        console.log(event);
        // open settings
    }
    return true;
});

if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    terminal.setOption('theme', darkTheme);
} else {
    terminal.setOption('theme', lightTheme);
}
if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
    terminal.onSelectionChange(() => {
        const data = terminal.getSelection();
        if (data === '') return;
        if (terminal.getSelection() === '') return;
        document.execCommand('copy');
        notifyAddon.notify('\u2702');
    });
}

socket.onopen = (_event: Event) => {
    console.log('Websocket connection opened.');
    socket.send(String.fromCharCode(msgHeader.CONNECT));
    fitAddon.fit();
    terminal.focus();
};
socket.onmessage = (event: MessageEvent) => {
    const data: ArrayBuffer | string = event.data;
    terminal.write(typeof data === 'string' ? data : new Uint8Array(data));
};
socket.onclose = (event: CloseEvent) => {
    console.log(`Websocket connection closed with code: ${event.code}`);
    notifyAddon.notify('Connection Closed', null);
};
socket.onerror = (event: Event) => {
    console.error('Websocket connection error: ', event);
};

window.addEventListener('resize', windowResizeListener);
window.addEventListener('beforeunload', windowUnloadListener);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', darkModeListener);
