(function () {
    "use strict";
    var cookieAlert = document.querySelector(".cookiealert");
    var acceptButton = document.querySelector(".acceptcookies");

    function getCookie(name) {
        var value = "; " + document.cookie;
        var parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(";").shift();
        return "";
    }

    function setCookie(name, value, days) {
        var expires = "";
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + value + expires + "; path=/";
    }

    if (cookieAlert) {
        if (!getCookie("acceptCookies")) {
            cookieAlert.classList.add("show"); // Show alert if no cookie is set
        } else {
            cookieAlert.classList.remove("show"); // Hide if cookie exists
        }

        acceptButton?.addEventListener("click", function () {
            setCookie("acceptCookies", "true", 365);
            cookieAlert.classList.remove("show"); // Hide alert on accept
        });
    }
})();