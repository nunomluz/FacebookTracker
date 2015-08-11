/*var windowId = -1;
var tabId = -1;

chrome.windows.onFocusChanged.addListener(function(windowId) {
    console.log('onFocusChanged! ---');
    console.log(windowId);
    if (windowId === -1) {
        console.log("minimized assumed");
    } else {
        chrome.windows.get(windowId, function(chromeWindow) {
            if(!chromeWindow) {
                return;
            }
            
            console.log(chromeWindow);
            if (chromeWindow.state === "minimized") {
                console.log("minimized");
            } else {
                console.log("not minimized");
                
        
                
            }
        });
    }
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    console.log('onActivated! ---');
    console.log(activeInfo);
});*/

            /*var t = this;
            chrome.windows.getAll({populate: true}, function(windows) {
                var fbWindowDetected = false;
                for(var i=0; i<windows.length && !fbWindowDetected; i++) {
                    if(windows[i].focused) {
                        for(var j=0; j<windows[i].tabs.length && !fbWindowDetected; j++) {
                            if(windows[i].tabs[j].active && windows[i].tabs[j].highlighted) {
                                if(windows[i].tabs[j].url.indexOf('https://www.facebook.com') === 0 ||
                                    windows[i].tabs[j].url.indexOf('http://www.facebook.com') === 0) {
                                    fbWindowDetected = true;
                                }
                            }
                        }
                    }
                }
                if(fbWindowDetected) {
                    t.actionDetected({fbAction: 'window', moment: t.getTimeString()});
                }
            });*/

//localStorage.removeItem('_FBTrack_Current_Period');
//localStorage.removeItem('_FBTrack_Cache_Period');

var FBTrackExtension = (function() {
    return {
        _CURRENT_PERIOD_KEY: '_FBTrack_Current_Period',
        _CACHE_PERIOD_KEY: '_FBTrack_Cache_Period',
        
        MIN_INACTIVE_TIME: 120000,  // 2 min. in ms
        MIN_SESSION_TIME: 20000,    // 20 sec. in ms
        
        init: function() {
            function goToAuth() {
                // open backend login tab (or focus if already open)
                chrome.tabs.getAllInWindow(null, function(tabs) {
                    for (var i = 0, tab; tab = tabs[i]; i++) {
                        if (tab.url && tab.url.indexOf(Rest.FB_LOGIN_PAGE) == 0) {
                            chrome.tabs.update(tab.id, {selected: true});
                            chrome.tabs.executeScript(tab.id, {code: 'window.location.reload();'});
                            return;
                        }
                    }
                    chrome.tabs.create({url: Rest.FB_LOGIN_PAGE});
                });
            }
                
            chrome.browserAction.onClicked.addListener(function(activeTab) {
                goToAuth();
            });
            
            // setup backend authentication listener
            chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
                // only consider msgs from facebook auth
                if(!request.status) return;
                
                if (request.status === 'connected') {
                    // actual login to backend
                    Rest.auth('AT', request.authResponse.accessToken).done(function(resp) {
                        console.debug('Authentication Successful!');
                    });
                } else if (request.status === 'not_authorized') {
                    // logged, but not the app.
                    goToAuth();
                } else {
                    // not logged to fb
                    goToAuth();
                }
            });
            
            // setup access token renewal
            var t = this;
            this.doAuthentication(t);
            setTimeout(function() { t.doAuthentication(t); }, 14400000); // 4h (renew FB auth)

            // setup facebook content script event listener
            chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
                t.actionDetected(request);
            });
            
            // setup monitor cycle
            if(!localStorage.getItem(this._CACHE_PERIOD_KEY)) {
                localStorage.setItem(this._CACHE_PERIOD_KEY, '[]');
            }
            this.doFlush(t);  
            setInterval(function() { t.doFlush(t); }, this.MIN_INACTIVE_TIME);            
        },
        
        getTimeString: function(d) {
            return moment(d ? d : new Date()).utc().format('YYYY-MM-DD HH:mm:ss');
        },
        
        getMoment: function(str) {
            return moment.utc(str);
        },
        
        getSessionDuration: function(session) {
            return this.getMoment(session.end_ts).valueOf() - this.getMoment(session.start_ts).valueOf();
        },
         
        doAuthentication: function(t) {
            // open backend page, which will request the access token to Facebook
            // and send it through a message to the extension
            $('iframe#auth-frame').attr('src', Rest.FB_LOGIN_BACKGROUND);
        },
        
        doFlush: function(t) {            
            var cache = JSON.parse(localStorage.getItem(t._CACHE_PERIOD_KEY));
            if(cache.length <= 0) {
                return;
            }

            Rest.createTimelog(cache).done(function(resp) {
                console.debug('Cached timelogs sent to server!');
                console.debug(resp);
                localStorage.setItem(t._CACHE_PERIOD_KEY, '[]');
            }).fail(function(resp, msg, err) {
                console.error('Unable to create timelog! Not removed from cache...', err);
            });
        },
        
        actionDetected: function(action) {
            if(!localStorage.getItem(this._CURRENT_PERIOD_KEY)) {
                localStorage.setItem(this._CURRENT_PERIOD_KEY, JSON.stringify({
                    start_ts: action.moment,
                    end_ts: action.moment
                }));
                return;
            }
            
            var json = JSON.parse(localStorage.getItem(this._CURRENT_PERIOD_KEY));
            var endTs = this.getMoment(json.end_ts);
            var m = this.getMoment(action.moment);
            var diff = m.valueOf() - endTs.valueOf();
            
            if(diff < this.MIN_INACTIVE_TIME) {
                json.end_ts = action.moment;
                console.debug('Ongoing Facebook Session for ' + this.getSessionDuration(json));
                localStorage.setItem(this._CURRENT_PERIOD_KEY, JSON.stringify(json));
                return;
            }
            
            if(this.getSessionDuration(json) < this.MIN_SESSION_TIME) {
                json.end_ts = this.getMoment(json.start_ts).clone().add(this.MIN_SESSION_TIME, 'milliseconds').format('YYYY-MM-DD HH:mm:ss');
            }
            
            console.debug('Finished Facebook Session of ' + this.getSessionDuration(json));
            // push to cache
            var cache = JSON.parse(localStorage.getItem(this._CACHE_PERIOD_KEY));
            cache.push(json);
            localStorage.setItem(this._CACHE_PERIOD_KEY, JSON.stringify(cache));
            localStorage.removeItem(this._CURRENT_PERIOD_KEY);
        }
    };
})();

var Rest = FBTrackClient('MTYxMjUxNDEwYmY5ZGEwM2RhM2Q2YTk2Yjg3YWQyYzNGQlRSQUNLX0NIUk9NRQ==');   // API Key
$(document).ready(function() {
	FBTrackExtension.init();
});

