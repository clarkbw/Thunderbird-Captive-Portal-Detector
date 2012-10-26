const {Cc,Ci} = require("chrome"),
      prefs = require("preferences-service"),
      obService = require("observer-service"),

      URL_PREF = "extensions." + require("self").id + ".url",
      URL = "http://clarkbw.net/lib/index.html",
      DEBUG_REDIRECTING_URL = "http://clarkbw.net/lib/redirect.html",
      DEBUG_301_REDIRECT_URL = "http://clarkbw.net/lib/test-301-redirect.html",
      DEBUG_META_REDIRECT_URL = "http://clarkbw.net/lib/test-meta-redirect.html",
      DEBUG_JS_REDIRECT_URL = "http://clarkbw.net/lib/test-js-redirect.html",

      MAIL_3PANE = "mail:3pane",

      NETWORK_STATUS_CHANGED = "network:offline-status-changed",
      NETWORK_STATUS_ONLINE = "online",
      NETWORK_STATUS_OFFLINE = "offline",

      CAPTIVE_PORTAL_STATUS = "network:captive-portal-status-changed",
      CAPTIVE_PORTAL_ACTIVE = "active",
      CAPTIVE_PORTAL_INACTIVE = "inactive";

//function isMail3PaneWindow(win) {
//  let winType = win.document.documentElement.getAttribute("windowtype");
//  return winType === MAIL_3PANE;
//}


exports.test_id = function(test) {
  test.assert(require("self").id.length > 0);
};

exports.test_pref_set = function(test) {
  var loader = test.makeSandboxedLoader();
  prefs.set(URL_PREF, DEBUG_REDIRECTING_URL);
  test.assert(prefs.get(URL_PREF) == DEBUG_REDIRECTING_URL);
};

exports.test_redirects = function (test) {
  let offlineManager = Cc["@mozilla.org/messenger/offline-manager;1"].getService(Ci.nsIMsgOfflineManager);
  let msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(Ci.nsIMsgWindow);
  let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

  test.waitUntilDone(30000);

  let redirects = 0;

  let mailWindow =  Cc["@mozilla.org/appshell/window-mediator;1"].
                      getService(Ci.nsIWindowMediator).
                      getMostRecentWindow(MAIL_3PANE);

  var networkStatusObserver = {
    observe: function networkStatusObserver_observe(aSubject, aTopic, aData) {
      switch (aTopic) {
        case NETWORK_STATUS_CHANGED:
          switch (aData) {
            case NETWORK_STATUS_ONLINE:
              break;
            case NETWORK_STATUS_OFFLINE:
              // Simply bounces the offline status back into online
              offlineManager.goOnline(false /* send unsent messages*/,
                                      false /* play back offline IMAP operations */,
                                      msgWindow);
              break;
          }
          break;
      }
    }
  };
  obService.add(NETWORK_STATUS_CHANGED, networkStatusObserver);

  var captivePortalObserver = {
    observe: function networkStatusObserver_observe(aSubject, aTopic, aData) {
      switch (aTopic) {
        case CAPTIVE_PORTAL_STATUS:
          switch (aData) {
            case CAPTIVE_PORTAL_ACTIVE:
              // we have to manually close the tab because it did it's job by
              // not closing when not on the original URL
              let tabmail = mailWindow.document.getElementById('tabmail');
              tabmail.closeOtherTabs(tabmail.tabInfo[0]);
              redirects++;
              nextTest();
              break;
            case CAPTIVE_PORTAL_INACTIVE:
              // This should only be happening on the first time
              test.assert(redirects == 0);
              nextTest();
              break;
          }
          break;
        }
    }
  };
  obService.add(CAPTIVE_PORTAL_STATUS, captivePortalObserver);

  let triggerNetwork = function() {
    offlineManager.synchronizeForOffline(false /* download news */,
                                         false /* download mail */,
                                         false /* send unsent message */,
                                         true /* go offline when done */,
                                         msgWindow);
  }

  let testSteps = [
    function() {
      prefs.set(URL_PREF, DEBUG_301_REDIRECT_URL);
      test.assert(!ioService.offline);
      triggerNetwork();
    },
    function() {
      prefs.set(URL_PREF, DEBUG_META_REDIRECT_URL);
      test.assert(!ioService.offline);
      triggerNetwork();
    },
    function() {
      prefs.set(URL_PREF, DEBUG_JS_REDIRECT_URL);
      test.assert(!ioService.offline);
      triggerNetwork();
    },
    function() {
      // Cleanup function that's called after the last detection
      obService.remove(CAPTIVE_PORTAL_STATUS, captivePortalObserver);
      obService.remove(NETWORK_STATUS_CHANGED, networkStatusObserver);

      // redirects should equal the number of functions above
      test.assert(redirects == 3,
                  "The number of redirects doesn't match the number of tests");
      test.done();
    }
  ];

  let nextTest = function() {
    let func = testSteps.shift();
    if (func) {
      func();
    } else {
    }
  }

  // Set the initial pref to the regular URL
  prefs.set(URL_PREF, URL);

  // Triggers the first detection which should be inactive
  require("main").main();

}
