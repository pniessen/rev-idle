// src/engine-infinity.js — Infinity layer mechanics (IP, tree, generators,
// challenges, Break Infinity, Stars). Pure; attaches to the shared Engine.
(function (E) {
  'use strict';
  const LOG2 = Math.log10(2);
  E._inf = { LOG2 }; // internal scratch shared by later sections of this file
})(typeof module !== 'undefined' && module.exports ? require('./engine.js') : window.Engine);
