import { mount } from 'svelte';
import '../../ui/theme.css';
import { t } from '../../shared/i18n.ts';
import App from './App.svelte';

document.documentElement.lang = browser.i18n.getUILanguage();
document.title = t('optionsTitle');
mount(App, { target: document.getElementById('app')! });
