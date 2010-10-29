Components.utils.import("resource://CaptivePortalDetector/handler.js");

const DEBUG = false;

let CaptivePortalDetector = {
  CHECK_URL : "http://clarkbw.net/lib/index.html",

  // For debug purposes only (this page does not exist)
  DEBUG_REDIRECTING_URL : "http://clarkbw.net/lib/redirect.html",

  log: function cpd_log(msg) {
    Application.console.log("CaptivePortalDetector: " + msg);
  },

  onLoad: function cpd_onload() {
    let tabmail = document.getElementById("tabmail");
    // we need to make sure that tabmail is ready to be used
    if (!tabmail) { return; }
    try {
      let url = (DEBUG)? this.DEBUG_REDIRECTING_URL : this.CHECK_URL;
      tabmail.registerTabType(CaptivePortalTabType);
      let CaptivePortalHandler = CaptivePortalHandlerFactory(tabmail, url);
      CaptivePortalHandler.onLoad();
    } catch (e) { this.log("onLoad.error: " + e); }
  }

};

var CaptivePortalTabType = {
  name: "captivePortalTab",
  perTabPanel: "vbox",

  modes: {
    captivePortalTab: {
      type: "captivePortalTab",
      maxTabs: 1
    }
  },
  shouldSwitchTo: function onSwitchTo() {
    let tabmail = document.getElementById("tabmail");
    let tabInfo = tabmail.tabInfo;

    for (let selectedIndex = 0; selectedIndex < tabInfo.length;
         ++selectedIndex) {
      if (tabInfo[selectedIndex].mode.name == this.name) {
        return selectedIndex;
      }
    }
    return -1;
  },
  openTab: function onTabOpened(aTab, aArgs) {
    if (!"oldURIspec" in aArgs && !"newURIspec" in aArgs)
      throw("oldURIspec and newURIspec must be specified");

    // First clone the page and set up the basics.
    let clone = document.getElementById("contentTab").firstChild.cloneNode(true);

    clone.setAttribute("id", "captivePortalTab");
    clone.setAttribute("collapsed", false);

    aTab.panel.appendChild(clone);

    // Start setting up the browser.
    aTab.browser = aTab.panel.getElementsByTagName("browser")[0];

    aTab.browser.setAttribute("type", "content-primary");

    aTab.browser.setAttribute("id", "captivePortalTabBrowser");

    aTab.browser.setAttribute("onclick",
                              "specialTabs.defaultClickHandler(event);");

    // Now initialise the find bar.
    aTab.findbar = aTab.panel.getElementsByTagName("findbar")[0];
    aTab.findbar.setAttribute("browserid",
                              "captivePortalTabBrowser");

    // Default to reload being disabled.
    aTab.reloadEnabled = false;

    // Now set up the listeners.
    this._setUpTitleListener(aTab);
    this._setUpCloseWindowListener(aTab);

    // Create a filter and hook it up to our browser
    let filter = Components.classes["@mozilla.org/appshell/component/browser-status-filter;1"]
                           .createInstance(Components.interfaces.nsIWebProgress);
    aTab.filter = filter;
    aTab.browser.webProgress.addProgressListener(filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);

    // Wire up a progress listener to the filter for this browser
    aTab.progressListener = new CaptivePortalDetectorTabListener(aTab, aArgs.oldURIspec);

    filter.addProgressListener(aTab.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);

    aTab.browser.loadURI(aArgs.newURIspec);

  },
  closeTab: function onTabClosed(aTab) {
    aTab.browser.removeEventListener("DOMTitleChanged",
                                     aTab.titleListener, true);
    aTab.browser.removeEventListener("DOMWindowClose",
                                     aTab.closeListener, true);
    aTab.browser.webProgress.removeProgressListener(aTab.filter);
    aTab.filter.removeProgressListener(aTab.progressListener);
    aTab.browser.destroy();
  },
  saveTabState: function onSaveTabState(aTab) {
    aTab.browser.setAttribute("type", "content-targetable");
  },
  showTab: function onShowTab(aTab) {
    aTab.browser.setAttribute("type", "content-primary");
  },
  persistTab: function onPersistTab(aTab) { },
  restoreTab: function onRestoreTab(aTabmail, aPersistedState) { },
  supportsCommand: function supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      case "cmd_stop":
      case "cmd_reload":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      default:
        return false;
    }
  },
  isCommandEnabled: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      case "cmd_reload":
        return aTab.reloadEnabled;
      case "cmd_stop":
        return aTab.busy;
      default:
        return false;
    }
  },
  doCommand: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_find":
        aTab.findbar.onFindCommand();
        break;
      case "cmd_findAgain":
        aTab.findbar.onFindAgainCommand(false);
        break;
      case "cmd_findPrevious":
        aTab.findbar.onFindAgainCommand(true);
        break;
      case "cmd_printSetup":
        PrintUtils.showPageSetup();
        break;
      case "cmd_print":
        PrintUtils.print();
        break;
      // XXX print preview not currently supported - bug 497994 to implement.
      //case "cmd_printpreview":
      //  PrintUtils.printPreview();
      //  break;
      case "cmd_stop":
        aTab.browser.stop();
        break;
      case "cmd_reload":
        aTab.browser.reload();
        break;
    }
  },
  getBrowser: function getBrowser(aTab) {
    return aTab.browser;
  },
  // Internal function used to set up the title listener on a content tab.
  _setUpTitleListener: function setUpTitleListener(aTab) {
    function onDOMTitleChanged(aEvent) {
      aTab.title = aTab.browser.contentTitle;
      document.getElementById("tabmail").setTabTitle(aTab);
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.titleListener = onDOMTitleChanged;
    // Add the listener.
    aTab.browser.addEventListener("DOMTitleChanged",
                                  aTab.titleListener, true);
  },
  /**
   * Internal function used to set up the close window listener on a content
   * tab.
   */
  _setUpCloseWindowListener: function setUpCloseWindowListener(aTab) {
    function onDOMWindowClose(aEvent) {
      if (!aEvent.isTrusted)
        return;

      // Redirect any window.close events to closing the tab. As a 3-pane tab
      // must be open, we don't need to worry about being the last tab open.
      document.getElementById("tabmail").closeTab(aTab);
      aEvent.preventDefault();
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.closeListener = onDOMWindowClose;
    // Add the listener.
    aTab.browser.addEventListener("DOMWindowClose",
                                  aTab.closeListener, true);
  }
};

function CaptivePortalDetectorTabListener(aTab, aURL) {
    this.mTab = aTab;
    this.mURL = aURL;
}
CaptivePortalDetectorTabListener.prototype = {
    onProgressChange: function tPL_onProgressChange(aWebProgress, aRequest,
                                                    aCurSelfProgress,
                                                    aMaxSelfProgress,
                                                    aCurTotalProgress,
                                                    aMaxTotalProgress) {
    },
    onProgressChange64: function tPL_onProgressChange64(aWebProgress, aRequest,
                                                        aCurSelfProgress,
                                                        aMaxSelfProgress,
                                                        aCurTotalProgress,
                                                        aMaxTotalProgress) {
    },
    onLocationChange: function tPL_onLocationChange(aWebProgress, aRequest,
                                                    aLocationURI) {
      // I've we've been redirected to our original check url then just
      // close the tab automatically, otherwise people can figure it out
      //dump("onLocationChange: " + this.mURL + " == " + aLocationURI.spec + "\n");
      if (this.mURL == aLocationURI.spec)
        document.getElementById("tabmail").closeTab(this.mTab);
    },
    onStateChange: function tPL_onStateChange(aWebProgress, aRequest, aStateFlags,
                                              aStatus) {
    },
    onStatusChange: function tPL_onStatusChange(aWebProgress, aRequest, aStatus,
                                                aMessage) {
    },
    onSecurityChange: function tPL_onSecurityChange(aWebProgress, aRequest,
                                                    aState) {
    },
    onRefreshAttempted: function tPL_OnRefreshAttempted(aWebProgress, aURI,
                                                        aDelay, aSameURI) {
    },
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIWebProgressListener,
                                           Components.interfaces.nsIWebProgressListener2,
                                           Components.interfaces.nsISupportsWeakReference])
}

window.addEventListener("load",   function() CaptivePortalDetector.onLoad(),   false);
