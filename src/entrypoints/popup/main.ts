import { mount } from 'svelte';
import '../../ui/theme.css';
import App from './App.svelte';

document.documentElement.lang = browser.i18n.getUILanguage();
mount(App, { target: document.getElementById('app')! });
