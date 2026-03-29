// page/agent.js — PageClaw entry point, wires all modules into window.__aiAgent
// Injected via chrome.scripting.executeScript
// Expects page/constants.js, page/dom-engine.js, page/element-ops.js,
//         page/page-info.js, page/animation.js to be loaded as globals first

(function () {
  'use strict';
  if (window.__aiAgent) return;

  window.__aiAgent = {
    // DOM Extraction Engine
    snapshot: domEngine.snapshot.bind(domEngine),

    // Page Info
    getPageInfo: pageInfo.getPageInfo.bind(pageInfo),
    getText: pageInfo.getText.bind(pageInfo),
    getPrices: pageInfo.getPrices.bind(pageInfo),
    clickFirstResult: pageInfo.clickFirstResult.bind(pageInfo),
    clickFirstBiliVideo: pageInfo.clickFirstBiliVideo.bind(pageInfo),
    clickFirstYouTubeVideo: pageInfo.clickFirstYouTubeVideo.bind(pageInfo),
    getHackerNewsTopStories: pageInfo.getHackerNewsTopStories.bind(pageInfo),
    getLinks: pageInfo.getLinks.bind(pageInfo),
    parseSearchResults: pageInfo.parseSearchResults.bind(pageInfo),
    findVideo: pageInfo.findVideo.bind(pageInfo),
    playVideo: pageInfo.playVideo.bind(pageInfo),
    extractData: pageInfo.extractData.bind(pageInfo),

    // Element Operations
    click: elementOps.click.bind(elementOps),
    type: elementOps.type.bind(elementOps),
    pressKey: elementOps.pressKey.bind(elementOps),
    scroll: elementOps.scroll.bind(elementOps),
    scrollTo: elementOps.scrollTo.bind(elementOps),
    scrollMultiple: elementOps.scrollMultiple.bind(elementOps),
    findSearchBox: elementOps.findSearchBox.bind(elementOps),
    typeInSearchBox: elementOps.typeInSearchBox.bind(elementOps),
    findSearchButton: elementOps.findSearchButton.bind(elementOps),
    clickSearchButton: elementOps.clickSearchButton.bind(elementOps),
    fillForm: elementOps.fillForm.bind(elementOps),

    // Animation System
    showOverlay: animSystem.showOverlay.bind(animSystem),
    hideOverlay: animSystem.hideOverlay.bind(animSystem),
    updateStatus: animSystem.updateStatus.bind(animSystem),
    setGlowState: animSystem.setGlowState.bind(animSystem),
    highlightElements: animSystem.highlightElements.bind(animSystem),
    initSteps: animSystem.initSteps.bind(animSystem),
    markStepFailed: animSystem.markStepFailed.bind(animSystem),
    showRetryStatus: animSystem.showRetryStatus.bind(animSystem),
    showFailureSummary: animSystem.showFailureSummary.bind(animSystem),
    showReplanning: animSystem.showReplanning.bind(animSystem),
    _removeFailureSummary: animSystem._removeFailureSummary.bind(animSystem),

    // Utilities (from constants.js or page-info.js)
    _getElement: pageInfo._getElement.bind(pageInfo),
    dismissPopups: pageInfo.dismissPopups.bind(pageInfo),
    _hasElement: pageInfo._hasElement.bind(pageInfo),
    _getUrl: pageInfo._getUrl.bind(pageInfo),
    getReadyState: pageInfo.getReadyState.bind(pageInfo),
  };
})();
