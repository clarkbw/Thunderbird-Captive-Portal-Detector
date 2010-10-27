var EXPORTED_SYMBOLS = ["CaptivePortalHandlerFactory"];

const DEBUG = true;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var gCaptivePortalHandler = null;

function CaptivePortalHandlerFactory() {
  if (gCaptivePortalHandler === null)
    gCaptivePortalHandler = new CaptivePortalHandler();
  return gCaptivePortalHandler;
}

/*
 * 
 */
function CaptivePortalHandler() { }
CaptivePortalHandler.prototype = {
  log: function cph_log(msg) {
      dump("CaptivePortalHandler: " + msg);
  },

  initialized : -1,

  channel : null,

  URI : null,

  CHECK_URL : "http://clarkbw.net/lib/index.html",

  // For debug purposes only (this page does not exist)
  DEBUG_REDIRECTING_URL : "http://clarkbw.net/lib/redirect.html",

  get mOS() {
    delete this._mOS;
    return this._mOS = Cc["@mozilla.org/observer-service;1"]
                        .getService(Ci.nsIObserverService);
  },

  get mIO() {
    delete this._mIO;
    return this._mIO = Cc["@mozilla.org/network/io-service;1"]
                        .getService(Ci.nsIIOService);
  },

  onLoad: function cph_onload(aCallback) {
    gCaptivePortalHandler.initialized++;
    this.log("onLoad " + gCaptivePortalHandler.initialized);
    this.mCallback = aCallback;

    //aTabBrowser.tabContainer.addEventListener('SSTabRestoring', this, false);

    if (gCaptivePortalHandler.initialized == 0) {
      if (DEBUG)
        this.URI = this.mIO.newURI(this.DEBUG_REDIRECTING_URL, null, null);
      else
        this.URI = this.mIO.newURI(this.CHECK_URL, null, null);

      this.log("this.URI: " + this.URI.spec);
      
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
    //this.log("this is wrong: " + JSON.stringify(this));
    if (this.channel == null) {
      this.log("channel is " + this.channel);
      // get a channel for the nsIURI
      this.channel = this.mIO.newChannelFromURI(this.URI);
  
      this.channel.notificationCallbacks = this;
      this.channel.asyncOpen(this, null);
      this.log("channel is " + this.channel);
    } else
      this.log("else - channel is " + this.channel);
  },

  openCaptivePortalTab: function cph_opencaptiveportaltab(aURI) {
    this.log("openCaptivePortalTab: " + aURI.spec);
    this.mCallback(aURI);
  },

  /**
   * Handle notifications
   */
  observe: function cph_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "network:offline-status-changed":
        this.log("You went " + aData);
        if ("online" == aData) {
          this.detectCaptivePortal();
        }
        break;

      case "quit-application":
        this.onUnload();
        break;
    }
  },


  // nsIStreamListener
  onStartRequest: function (aRequest, aContext) { },
  onDataAvailable: function (aRequest, aContext, aStream, aSourceOffset, aLength) { },
  onStopRequest: function (aRequest, aContext, aStatus) {
    gCaptivePortalHandler.log("onStopRequest");
    gCaptivePortalHandler.channel = null;
  },

  // nsIChannelEventSink
  onChannelRedirect: function (aOldChannel, aNewChannel, aFlags) {
    // if redirecting, store the new channel
    gCaptivePortalHandler.channel = aNewChannel;
    if (gCaptivePortalHandler.URI == aOldChannel.URI &&
        gCaptivePortalHandler.URI != aNewChannel.URI) {
      this.openCaptivePortalTab.call(gCaptivePortalHandler, aNewChannel.URI);
    }
    this.log("onChannelRedirect " + this.URI.spec + " == " + aOldChannel.URI.spec + " &&\n\t\t" + this.URI.spec + " != " + aNewChannel.URI.spec);
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
