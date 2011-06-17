This is a [Captive Portal](http://en.wikipedia.org/wiki/Captive_portal) detector
[add-on](https://addons.mozilla.org/thunderbird/) for [Thunderbird](http://www.mozillamessaging.com/thunderbird/).

**Captive Portals** are those redirect pages you get when you first use the internet
connection at an airport or hotel or public wifi spot.  Often a captive portal is
requesting agreement to a Terms of Service and/or payment for usage.

**Thunderbird** doesn't currently detect Captive Portals well because they are
designed to redirect web _HTTP_ traffic and not mail _SMTP/POP/IMAP_.  So if you
aren't using a web browser Thunderbird appears to not be able to connect to your
email and until you browse the web you won't know why.


How it works
======================================

This is a standard system for detecting captive portals, send a request to a known
location and watch to see if you are redirected.

* On startup or when the network connection goes online: Open a hidden tab in the background
* The tab is going to a [known location](http://clarkbw.net/lib/index.html) and will show itself if it gets [redirected](http://clarkbw.net/lib/redirect.html) before reaching it's known location


Development setup
======================================
* `git clone https://clarkbw@github.com/clarkbw/Thunderbird-Captive-Portal-Detector.git`
* `cd Thunderbird-Captive-Portal-Detector/src/`
* `pwd > tbcaptiveportaldetector@momo`
* `mv tbcaptiveportaldetector@momo "YOUR THUNDERBIRD PROFILE DIRECTORY"`
* Start Thunderbird

Known Issues
======================================

* javascript: links are not supported by Thunderbird and so you won't be able to
  continue if a page requires you click on those links.


New Issues
======================================

If you find a problem or a captive portal that wasn't detected correctly please
file an issue in the github issue tracker.  When filing please include the location
and if possible the source code and URL of the problem portal page.

