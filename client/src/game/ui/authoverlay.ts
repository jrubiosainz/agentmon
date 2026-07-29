/**
 * DOM overlay for account register/login. Typing an email on a canvas-drawn
 * GBA keyboard is miserable, so this one screen borrows real HTML inputs and
 * is styled to match the game's palette.
 */

import { saves } from '../save.ts';

let overlay: HTMLDivElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function authOverlayOpen(): boolean {
  return overlay !== null;
}

/** Opens the account dialog. Resolves true when the player is signed in. */
export function openAuthOverlay(mode: 'login' | 'register' = 'login'): Promise<boolean> {
  if (overlay) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const root = el('div', 'am-overlay');
    overlay = root;

    const card = el('div', 'am-card');
    const title = el('h2', 'am-title', 'AGENTMON NETWORK');
    const sub = el('p', 'am-sub', 'Sign in to sync your journey to the cloud.');

    const tabs = el('div', 'am-tabs');
    const tabLogin = el('button', 'am-tab', 'LOG IN');
    const tabRegister = el('button', 'am-tab', 'REGISTER');
    tabs.append(tabLogin, tabRegister);

    const form = el('form', 'am-form');
    const nameRow = el('label', 'am-row');
    nameRow.append(el('span', 'am-label', 'TRAINER NAME'));
    const nameInput = el('input', 'am-input');
    nameInput.type = 'text';
    nameInput.maxLength = 20;
    nameInput.autocomplete = 'name';
    nameRow.append(nameInput);

    const emailRow = el('label', 'am-row');
    emailRow.append(el('span', 'am-label', 'EMAIL'));
    const emailInput = el('input', 'am-input');
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.required = true;
    emailRow.append(emailInput);

    const passRow = el('label', 'am-row');
    passRow.append(el('span', 'am-label', 'PASSWORD'));
    const passInput = el('input', 'am-input');
    passInput.type = 'password';
    passInput.autocomplete = 'current-password';
    passInput.required = true;
    passInput.minLength = 8;
    passRow.append(passInput);

    const msg = el('p', 'am-msg');
    const actions = el('div', 'am-actions');
    const submit = el('button', 'am-btn am-primary', 'LOG IN');
    submit.type = 'submit';
    const skip = el('button', 'am-btn', 'PLAY OFFLINE');
    skip.type = 'button';
    actions.append(submit, skip);

    form.append(nameRow, emailRow, passRow, msg, actions);
    card.append(title, sub, tabs, form);
    root.append(card);
    document.body.append(root);

    let current: 'login' | 'register' = mode;

    const applyMode = (): void => {
      tabLogin.classList.toggle('am-active', current === 'login');
      tabRegister.classList.toggle('am-active', current === 'register');
      nameRow.style.display = current === 'register' ? '' : 'none';
      passInput.autocomplete = current === 'register' ? 'new-password' : 'current-password';
      submit.textContent = current === 'register' ? 'CREATE ACCOUNT' : 'LOG IN';
      sub.textContent = current === 'register'
        ? 'Create an account to sync saves across devices.'
        : 'Sign in to sync your journey to the cloud.';
      msg.textContent = '';
    };
    applyMode();

    const close = (result: boolean): void => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      overlay = null;
      resolve(result);
    };

    const onKey = (e: KeyboardEvent): void => {
      // Keep the game's key handler from seeing anything typed in the form.
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey, true);

    tabLogin.addEventListener('click', () => { current = 'login'; applyMode(); });
    tabRegister.addEventListener('click', () => { current = 'register'; applyMode(); });
    skip.addEventListener('click', () => close(false));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passInput.value;
      const name = nameInput.value.trim() || email.split('@')[0] || 'AGENT';
      if (!email || !password) {
        msg.textContent = 'Email and password are required.';
        return;
      }
      if (current === 'register' && password.length < 8) {
        msg.textContent = 'Password must be at least 8 characters.';
        return;
      }
      submit.disabled = true;
      skip.disabled = true;
      msg.textContent = 'Connecting...';
      const task = current === 'register'
        ? saves.register(email, password, name)
        : saves.login(email, password);
      void task.then((ok) => {
        submit.disabled = false;
        skip.disabled = false;
        if (ok) close(true);
        else msg.textContent = saves.lastError ?? 'Sign in failed.';
      });
    });

    setTimeout(() => emailInput.focus(), 30);
  });
}

const STYLE_ID = 'agentmon-auth-style';

export function installAuthStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.am-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;
  background:rgba(4,8,18,.82);backdrop-filter:blur(3px);font-family:'Courier New',monospace}
.am-card{width:min(420px,92vw);background:#f8f8f8;border:4px solid #101828;border-radius:10px;
  box-shadow:0 0 0 3px #58a0d8,0 18px 40px rgba(0,0,0,.6);padding:20px 22px}
.am-title{margin:0 0 4px;font-size:19px;letter-spacing:2px;color:#101828}
.am-sub{margin:0 0 14px;font-size:12px;color:#586074;min-height:30px}
.am-tabs{display:flex;gap:6px;margin-bottom:14px}
.am-tab{flex:1;padding:7px 0;font:inherit;font-size:12px;letter-spacing:1px;cursor:pointer;
  background:#dfe3ec;border:2px solid #a8b0c0;border-radius:6px;color:#404858}
.am-tab.am-active{background:#58a0d8;border-color:#2c5a90;color:#fff}
.am-row{display:block;margin-bottom:10px}
.am-label{display:block;font-size:10px;letter-spacing:1.4px;color:#586074;margin-bottom:3px}
.am-input{width:100%;box-sizing:border-box;padding:8px 9px;font:inherit;font-size:14px;
  border:2px solid #a8b0c0;border-radius:5px;background:#fff;color:#101828}
.am-input:focus{outline:none;border-color:#58a0d8;box-shadow:0 0 0 2px rgba(88,160,216,.35)}
.am-msg{min-height:16px;margin:6px 0 10px;font-size:11px;color:#c04038}
.am-actions{display:flex;gap:8px}
.am-btn{flex:1;padding:10px 0;font:inherit;font-size:12px;letter-spacing:1px;cursor:pointer;
  border:2px solid #a8b0c0;border-radius:6px;background:#e8ebf2;color:#303848}
.am-btn:disabled{opacity:.55;cursor:default}
.am-primary{background:#f0a828;border-color:#a06818;color:#2a1c04}
.am-btn:hover:not(:disabled){filter:brightness(1.06)}
`;
  document.head.append(style);
}
