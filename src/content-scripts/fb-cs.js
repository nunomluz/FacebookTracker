(function() {
    function getTimeString(d) {
        return moment(d ? d : new Date()).utc().format('YYYY-MM-DD HH:mm:ss');
    }

    var mouseMoveTimeout = null;
    document.onmousemove = function(e){
        if(mouseMoveTimeout) {
            return;
        }
        
        mouseMoveTimeout = setTimeout(function() {
            chrome.runtime.sendMessage({fbAction: 'mousemove', moment: getTimeString()}, function(r) {
                if (!r.success) {
                    console.debug(r);
                    console.error('Could not send action to extension!');
                }
            });
            mouseMoveTimeout = null;
        }, 5000);
    };

    var mouseClickTimeout = null;
    document.onclick = function(e){
        if(mouseClickTimeout) {
            return;
        }
        
        mouseClickTimeout = setTimeout(function() {
            chrome.runtime.sendMessage({fbAction: 'click', moment: getTimeString()}, function(r) {
                if (!r.success) {
                    console.debug(r);
                    console.error('Could not send action to extension!');
                }
            });
            mouseClickTimeout = null;
        }, 5000);
    };

    var scrollTimeout = null;
    window.addEventListener("scroll", function(e){
        if(scrollTimeout) {
            return;
        }
        
        scrollTimeout = setTimeout(function() {
            chrome.runtime.sendMessage({fbAction: 'scroll', moment: getTimeString()}, function(r) {
                if (!r.success) {
                    console.debug(r);
                    console.error('Could not send action to extension!');
                }
            });
            scrollTimeout = null;
        }, 5000);
    });
})();