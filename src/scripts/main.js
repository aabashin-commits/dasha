/**
 * Точка входа. Только регистрация модулей — логики здесь быть не должно.
 * Каждый модуль сам проверяет наличие своих элементов и молча выходит,
 * если их на странице нет.
 */

import * as analytics from './modules/analytics.js';
import * as nav from './modules/nav.js';
import * as spine from './modules/spine.js';
import * as heroCuts from './modules/hero-cuts.js';
import * as worksFilter from './modules/works-filter.js';
import * as videoFacade from './modules/video-facade.js';
import * as lightbox from './modules/lightbox.js';
import * as form from './modules/form.js';
import * as cookie from './modules/cookie.js';
import * as reveal from './modules/reveal.js';

const MODULES = [
  analytics, nav, spine, heroCuts,
  worksFilter, videoFacade, lightbox, form, cookie, reveal,
];

for (const mod of MODULES) {
  try {
    mod.init();
  } catch (e) {
    // Падение одного модуля не должно уносить остальные
    console.error('[keyframe] модуль не запустился:', e);
  }
}
