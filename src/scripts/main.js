/**
 * Точка входа. Только регистрация модулей — логики здесь быть не должно.
 * Каждый модуль сам проверяет наличие своих элементов и молча выходит,
 * если их на странице нет.
 */

import * as analytics from './modules/analytics.js';
import * as nav from './modules/nav.js';
import * as spine from './modules/spine.js';
import * as heroCuts from './modules/hero-cuts.js';
import * as reveal from './modules/reveal.js';

const MODULES = [analytics, nav, spine, heroCuts, reveal];

for (const mod of MODULES) {
  try {
    mod.init();
  } catch (e) {
    // Падение одного модуля не должно уносить остальные
    console.error('[keyframe] модуль не запустился:', e);
  }
}
