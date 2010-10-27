Components.utils.import("resource://CaptivePortalDetector/handler.js");

let CaptivePortalDetector = {

  get mWindow() {
    delete this._mWindow;
    return this._mWindow = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                            .getService(Components.interfaces.nsIWindowMediator)
                            .getMostRecentWindow("mail:3pane");
  },

  log: function cpd_log(msg) {
    Application.console.log("CaptivePortalDetector: " + msg);
  },

  onLoad: function cpd_onload() {
    //this.strings = document.getElementById("CaptivePortalDetector-strings");
    this.log("onLoad");
    var self = this;
    CaptivePortalHandlerFactory(Application.console).onLoad(function(aURI) { self.openCaptivePortalTab(aURI) });
  },

  openCaptivePortalTab: function cpd_opencaptiveportaltab(aURI) {
    this.log("openCaptivePortalTab: " + aURI.spec);
    try {
      let tabmail = this.mWindow.document.getElementById("tabmail");
      tabmail.openTab("contentTab", { contentPage: aURI.spec });
    } catch (e) {
      this.log("openCaptivePortalTab.error: " + e);
    }
  }

};

window.addEventListener("load",   function() CaptivePortalDetector.onLoad(),   false);
//window.addEventListener("unload", function() CaptivePortalDetector.onUnload(), false);
