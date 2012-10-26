const {Cc, Ci, Cr} = require("chrome"),
      winUtils = require("window-utils"),
      obService = require("observer-service"),
      prefs = require("preferences-service"),

      URL_PREF = "extensions." + require("self").id + ".url",
      URL = "http://clarkbw.net/lib/index.html",

      MAIL_3PANE = "mail:3pane",
      NETWORK_STATUS_CHANGED = "network:offline-status-changed",
      NETWORK_STATUS_ONLINE = "online",

      CAPTIVE_PORTAL_STATUS = "network:captive-portal-status-changed",
      CAPTIVE_PORTAL_ACTIVE = "active",
      CAPTIVE_PORTAL_INACTIVE = "inactive";

let registered = false;

exports.main = function (options, callbacks) {
  if (!prefs.isSet(URL_PREF)) {
    prefs.set(URL_PREF, URL);
  }

  var windowTracker = new winUtils.WindowTracker(mailWindowManager);
  require("unload").ensure(windowTracker);
  obService.add(NETWORK_STATUS_CHANGED, networkStatusObserver);
};

exports.onUnload = function (reason) {
  obService.remove(NETWORK_STATUS_CHANGED, networkStatusObserver);
};

function isMail3PaneWindow(win) {
  let winType = win.document.documentElement.getAttribute("windowtype");
  return winType === MAIL_3PANE;
}

/**
 * Watches the "network:offline-status-changed" topic for the "online" subject
 * event and tries to open the portal detector using exports.openPortalDetector
 */
var networkStatusObserver = {
  observe: function networkStatusObserver_observe(aSubject, aTopic, aData) {
    //dump("networkStatusObserver : " + aData + "\n\n\n");
    switch (aTopic) {
      case NETWORK_STATUS_CHANGED:
        if (NETWORK_STATUS_ONLINE === aData) {
          for (window in winUtils.windowIterator()) {
            if (isMail3PaneWindow(window)) {
              openPortalDetector(window.document);
            }
          }
        }
        break;
    }
  }
};

/**
 * Window watcher object (will attach to all windows, even pref windows)
 * Attaches buttons to new windows and removes them when they disappear
 */
var mailWindowManager = {
  onTrack: function mailWindowManager_onTrack(window) {
    if (isMail3PaneWindow(window)) {
      //if (!registered) {
        registerTabType(window.document);
        registered = true;
      //}
      openPortalDetector(window.document);
      //console.log("tracking window");
    }
  },
  onUntrack: function mailWindowManager_onUntrack(window) {
    if (isMail3PaneWindow(window)) {
      //console.log("Untracking a window: " + window.document);
    }
  }
};

function registerTabType(document) {
  //console.log("registerTabType");
  try {
    document.getElementById('tabmail').registerTabType(new CaptivePortalTabType(document));
  } catch(e) {
    console.log("error : " + e);
  }
}

function openPortalDetector(document) {
  //console.log("openPortalDetector : " + prefs.get(URL_PREF));
  try {
    document.getElementById('tabmail').openTab("captivePortalTab",
                                               { "contentPage"  : prefs.get(URL_PREF)});
  } catch(e) {
    console.log("error : " + e);
  }
}

function CaptivePortalTabType(document) {
  this.mDoc = document;
  //console.log("CaptivePortalTabType");
}

CaptivePortalTabType.prototype = {
  name: "captivePortalTab",
  perTabPanel: "vbox",

  modes: {
    captivePortalTab: {
      type: "captivePortalTab",
      maxTabs: 1
    }
  },
  shouldSwitchTo: function onSwitchTo() {
    let tabmail = this.mDoc.getElementById("tabmail");
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
    if (!"contentPage" in aArgs)
      throw("contentPage must be specified");

    //console.log("CaptivePortalTabType.openTab(" + aArgs.contentPage + ")");

    // First clone the page and set up the basics.
    let clone = this.mDoc.getElementById("contentTab").firstChild.cloneNode(true);

    clone.setAttribute("id", "captivePortalTab");

    // Ensure that our tab panel doesn't show any content until it's loaded
    clone.setAttribute("collapsed", true);

    // Ensure that our tab is not visible at first
    aTab.tabNode.setAttribute("collapsed", true);

    // Keep the clone around so we have easier access to it later
    aTab.clone = clone;
    aTab.panel.appendChild(clone);

    // Set this attribute so that when favicons fail to load, we remove the
    // image attribute and just show the default tab icon.
    aTab.tabNode.setAttribute("onerror", "this.removeAttribute('image');");

    // Start setting up the browser.
    aTab.browser = aTab.panel.getElementsByTagName("browser")[0];

    // Open as a background tab by default
    aTab.browser.setAttribute("type", "content-targetable");

    aTab.browser.setAttribute("id", "captivePortalTabBrowser");

    aTab.browser.setAttribute("onclick",
                              "specialTabs.defaultClickHandler(event);");

    // Now initialise the find bar.
    aTab.findbar = aTab.panel.getElementsByTagName("findbar")[0];
    aTab.findbar.setAttribute("browserid", "captivePortalTabBrowser");

    // Default to reload being enabled.
    aTab.reloadEnabled = true;

    // Now set up the listeners.
    this._setUpTitleListener(aTab, this.mDoc);
    this._setUpCloseWindowListener(aTab, this.mDoc);
    this._setUpDOMMetaListener(aTab, this.mDoc);

    // Create a filter and hook it up to our browser
    let filter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
                           .createInstance(Ci.nsIWebProgress);
    aTab.filter = filter;
    aTab.browser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);

    // Wire up a progress listener to the filter for this browser
    aTab.progressListener = new CaptivePortalDetectorTabListener(aTab, aArgs.contentPage, this.mDoc);

    filter.addProgressListener(aTab.progressListener, Ci.nsIWebProgress.NOTIFY_ALL);


    aTab.browser.loadURI(aArgs.contentPage);

  },
  closeTab: function onTabClosed(aTab) {
    //console.log("CaptivePortalTabType.closeTab(" + aTab+ ")");

    aTab.browser.removeEventListener("DOMTitleChanged", aTab.titleListener, true);
    aTab.browser.removeEventListener("DOMWindowClose", aTab.closeListener, true);
    aTab.browser.removeEventListener("DOMMetaAdded", aTab.domMetaHandler, false);

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
  _setUpTitleListener: function setUpTitleListener(aTab, doc) {
    function onDOMTitleChanged(aEvent) {
      aTab.title = aTab.browser.contentTitle;
      doc.getElementById("tabmail").setTabTitle(aTab);
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
  _setUpCloseWindowListener: function setUpCloseWindowListener(aTab, doc) {
    function onDOMWindowClose(aEvent) {
      if (!aEvent.isTrusted)
        return;

      // Redirect any window.close events to closing the tab. As a 3-pane tab
      // must be open, we don't need to worry about being the last tab open.
      doc.getElementById("tabmail").closeTab(aTab);
      aEvent.preventDefault();
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.closeListener = onDOMWindowClose;
    // Add the listener.
    aTab.browser.addEventListener("DOMWindowClose",
                                  aTab.closeListener, true);
  },
  _setUpDOMMetaListener: function setupDOMMetaListener(aTab, doc) {
    function onDOMMetaAdded(aEvent) {
      // XXX is it a meta refresh?
      aTab.progressListener.signalRedirect();
      aEvent.preventDefault();
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.domMetaHandler = onDOMMetaAdded;
    // Add the listener.
    aTab.browser.addEventListener("DOMMetaAdded",
                                  aTab.domMetaHandler, true);
  }
};

function CaptivePortalDetectorTabListener(aTab, aURL, aDoc) {
    this.mTab = aTab;
    this.mURL = aURL;
    this.mDoc = aDoc;
    this.redirected = false;
    //console.log("CaptivePortalDetectorTabListener");
}
CaptivePortalDetectorTabListener.prototype = {
    signalRedirect : function cptl_signalRedirec() {
      this.redirected = true;
      // Notify all observers that we've detected a captive portal
      Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService).
        notifyObservers(null, CAPTIVE_PORTAL_STATUS, CAPTIVE_PORTAL_ACTIVE);

      // Show the tab
      this.mTab.tabNode.setAttribute("collapsed", false);
      // Show the panel
      this.mTab.clone.setAttribute("collapsed", false);
      // Bring to the front
      this.mDoc.getElementById("tabmail").switchToTab(this.mTab);
    },
    onProgressChange: function tPL_onProgressChange(aWebProgress, aRequest,
                                                    aCurSelfProgress,
                                                    aMaxSelfProgress,
                                                    aCurTotalProgress,
                                                    aMaxTotalProgress) {
      //console.log("CaptivePortalDetectorTabListener.onProgressChange");
    },
    onProgressChange64: function tPL_onProgressChange64(aWebProgress, aRequest,
                                                        aCurSelfProgress,
                                                        aMaxSelfProgress,
                                                        aCurTotalProgress,
                                                        aMaxTotalProgress) {
    },
    onLocationChange: function tPL_onLocationChange(aWebProgress, aRequest,
                                                    aLocationURI) {
      // If we've been redirected to our original check url then just
      // close the tab automatically, otherwise people can figure it out
      //console.log("CaptivePortalDetectorTabListener.onLocationChange: " + this.mURL + " == " + aLocationURI.spec + "\n");
      if (this.mURL == aLocationURI.spec) {
        // Give ourselves about 5 seconds to let a redirect happen, it sucks, I know
        var self = this;
        this.mDoc.defaultView.setTimeout(function() {
          dump("self.redirect: " + self.redirected + "\n");
          if (!self.redirected) {
          self.mDoc.getElementById("tabmail").closeTab(self.mTab);
          Cc["@mozilla.org/observer-service;1"].
            getService(Ci.nsIObserverService).
            notifyObservers(null, CAPTIVE_PORTAL_STATUS, CAPTIVE_PORTAL_INACTIVE);
          }
        }, 1000 * 5);

      } else {
        this.signalRedirect();
      }
    },
    onStateChange: function tPL_onStateChange(aWebProgress, aRequest, aStateFlags,
                                              aStatus) {
      //console.log("CaptivePortalDetectorTabListener.onStateChange " + aRequest + " : " + aStateFlags);
    },
    onStatusChange: function tPL_onStatusChange(aWebProgress, aRequest, aStatus,
                                                aMessage) {
      //console.log("CaptivePortalDetectorTabListener.onStatusChange " + aStatus + " : " + aMessage);
    },
    onSecurityChange: function tPL_onSecurityChange(aWebProgress, aRequest,
                                                    aState) {
    },
    onRefreshAttempted: function tPL_OnRefreshAttempted(aWebProgress, aURI,
                                                        aDelay, aSameURI) {
      //console.log("CaptivePortalDetectorTabListener.onRefreshAttempted " + aURI + " : " + aSameURI + " - " + aDelay);
    },
    QueryInterface: function(iid) {
      if (iid.equals(Ci.nsIWebProgressListener) ||
          iid.equals(Ci.nsIWebProgressListener2) ||
          iid.equals(Ci.nsISupportsWeakReference))
        return this;
      throw Cr.NS_ERROR_NO_INTERFACE;
    }
}
