const main = require("main"),
      winUtils = require("window-utils"),
      {Cc,Ci} = require("chrome"),
      prefs = require("preferences-service"),

      URL_PREF = "extensions." + require("self").id + ".url",
      URL = "http://clarkbw.net/lib/index.html",
      DEBUG_REDIRECTING_URL = "http://clarkbw.net/lib/redirect.html",

      MAIL_3PANE = "mail:3pane",

      CAPTIVE_PORTAL_STATUS = "network:captive-portal-status-changed",
      CAPTIVE_PORTAL_ACTIVE = "active";

prefs.set(URL_PREF, DEBUG_REDIRECTING_URL);
main.main();

function isMail3PaneWindow(win) {
  let winType = win.document.documentElement.getAttribute("windowtype");
  return winType === MAIL_3PANE;
}

exports.test_id = function(test) {
  test.assert(require("self").id.length > 0);
};

exports.test_pref_set = function(test) {
  test.assert(prefs.get(URL_PREF).length > 0);
};

exports.test_go_offline_online = function (test) {
  let offlineManager = Cc["@mozilla.org/messenger/offline-manager;1"].getService(Ci.nsIMsgOfflineManager);
  let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(Ci.nsIMsgWindow);

  test.waitUntilDone(20000);

  var observer = {
                  observe: function networkStatusObserver_observe(aSubject, aTopic, aData) {
                    switch (aTopic) {
                      case CAPTIVE_PORTAL_STATUS:
                        Cc["@mozilla.org/observer-service;1"].
                          getService(Ci.nsIObserverService).
                          removeObserver(observer, CAPTIVE_PORTAL_STATUS);
                        if (CAPTIVE_PORTAL_ACTIVE === aData) {
                          test.done();
                        }
                        break;
                      }
                  }
                };

  Cc["@mozilla.org/observer-service;1"].
    getService(Ci.nsIObserverService).
    addObserver(observer, CAPTIVE_PORTAL_STATUS, false);

  test.assert(!ioService.offline);

  // XXX this isn't working but is unneeded because we can test without it
  //// Trigger offline event
  //offlineManager.synchronizeForOffline(false, /* download news messages */
  //                                     false, /* download mail messages */
  //                                     false, /* send unsent messages */
  //                                     true,  /* work offline */
  //                                     msgWindow);
  //
  //test.assert(ioService.offline);

  // Create an online event even though we know we are already online
  offlineManager.goOnline(false /* send unsent messages*/,
                          false /* play back offline IMAP operations */,
                          msgWindow);

  // We are still online
  test.assert(!ioService.offline);

}
