var EXPORTED_SYMBOLS = ["CaptivePortalHandlerFactory"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

/* Older versions of XPCOMUtils aren't as lazy as the newer ones */

if (typeof XPCOMUtils.defineLazyServiceGetter !== "function") {
  XPCOMUtils.defineLazyServiceGetter = function(aObject, aName,
                                                aContract, aInterfaceName) {
    XPCOMUtils.defineLazyGetter(aObject, aName, function XPCU_serviceLambda() {
      return Cc[aContract].getService(Ci[aInterfaceName]);
    });
  };
}

var gCaptivePortalHandler = null;

function CaptivePortalHandlerFactory(aTabMail, aURL) {
  if (gCaptivePortalHandler === null)
    gCaptivePortalHandler = new CaptivePortalHandler(aTabMail, aURL);
  return gCaptivePortalHandler;
}

/*
 * This module handles our checking for a certain URL which cannot have a redirect
 * If the given URL does redirect when going online or at first load our module
 * assumes we're being captured by a login portal and opens the redirected page
 * in a tab for the user to login or accept a TOS
 */
function CaptivePortalHandler(aTabMail, aURL) {
  this.mTabMail = aTabMail;
  this.mURL = aURL;

  XPCOMUtils.defineLazyServiceGetter(this, "mIO",
                                     "@mozilla.org/network/io-service;1",
                                     "nsIIOService");

  XPCOMUtils.defineLazyServiceGetter(this, "mOS",
                                     "@mozilla.org/observer-service;1",
                                     "nsIObserverService");

}

CaptivePortalHandler.prototype = {
  log: function cph_log(msg) {
      dump("CaptivePortalHandler: " + msg + "\n");
  },

  initialized : false,

  onLoad: function cph_onload() {
    this.log("onLoad " + this.initialized);

    if (!this.initialized) {
      this.initialized = true;
      this.log("this.mURL: " + this.mURL);
      this.mOS.addObserver(gCaptivePortalHandler, "network:offline-status-changed", true);
      this.mOS.addObserver(gCaptivePortalHandler, "quit-application", true);
    }

    this.detectCaptivePortal();
  },

  onUnload: function cph_onunload() {
    this.mOS.removeObserver(gCaptivePortalHandler, "network:offline-status-changed", true);
    this.mOS.removeObserver(gCaptivePortalHandler, "quit-application", true);
  },

  // Check for the right network connection without a redirect
  detectCaptivePortal: function cph_detectcaptiveportal() {
    this.log("detectCaptivePortal");

    var channel = this.mIO.newChannel(this.mURL, null, null);
    channel.loadFlags = Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE;

    channel.notificationCallbacks = this;
    channel.asyncOpen(this, null);

  },

  openCaptivePortalTab: function cph_opencaptiveportaltab(aOldURI, aNewURI) {
    gCaptivePortalHandler.log("openCaptivePortalTab: " + aOldURI.spec + " : " + aNewURI.spec);
    try {
      gCaptivePortalHandler.mTabMail.openTab("captivePortalTab", { oldURIspec: aOldURI.spec,
                                                                   newURIspec: aNewURI.spec });
    } catch(e) { gCaptivePortalHandler.log("openCaptivePortalTab.error: " + e); }
  },

  /**
   * Handle notifications
   */
  observe: function cph_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "network:offline-status-changed":
        this.log("You went " + aData);
        if ("online" == aData) {
          this.detectCaptivePortal.call(gCaptivePortalHandler);
        }
        break;

      case "quit-application":
        this.onUnload.call(gCaptivePortalHandler);
        break;
    }
  },


  // nsIStreamListener
  onStartRequest: function (aRequest, aContext) { },
  onDataAvailable: function (aRequest, aContext, aStream, aSourceOffset, aLength) { },
  onStopRequest: function (aRequest, aContext, aStatus) {
    gCaptivePortalHandler.log("onStopRequest");
  },

  // nsIChannelEventSink
  onChannelRedirect: function (aOldChannel, aNewChannel, aFlags) {
    // if redirecting, store the new channel
    if (gCaptivePortalHandler.mURL == aOldChannel.URI.spec &&
        gCaptivePortalHandler.mURL != aNewChannel.URI.spec) {
      gCaptivePortalHandler.openCaptivePortalTab.call(gCaptivePortalHandler, aOldChannel.URI, aNewChannel.URI);
    }
  },
  asyncOnChannelRedirect: function (aOldChannel, aNewChannel, aFlags, aCallback) {
    if (gCaptivePortalHandler.mURL == aOldChannel.URI.spec &&
        gCaptivePortalHandler.mURL != aNewChannel.URI.spec) {
      gCaptivePortalHandler.openCaptivePortalTab.call(gCaptivePortalHandler, aOldChannel.URI, aNewChannel.URI);
    }
  },

  // nsIHttpEventSink (called after onChannelRedirect)
  onRedirect : function (aOldChannel, aNewChannel) { },

  // nsIInterfaceRequestor
  getInterface: function (aIID) {
    try {
      return this.QueryInterface(aIID);
    } catch (e) {
      throw Cr.NS_NOINTERFACE;
    }
  },

  // nsIProgressEventSink (not implementing will cause annoying exceptions)
  onProgress : function (aRequest, aContext, aProgress, aProgressMax) { },
  onStatus : function (aRequest, aContext, aStatus, aStatusArg) { },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsISupports,
                                         Ci.nsIInterfaceRequestor,
                                         Ci.nsIChannelEventSink,
                                         Ci.nsIProgressEventSink,
                                         Ci.nsIHttpEventSink,
                                         Ci.nsIStreamListener])

};
