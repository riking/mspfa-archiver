(function() {
	// [BEGIN] riking: Globals
	var GLOBAL_ASSET_BASEURL = "https://mspfa.com"; // TODO: Mirror on archive.org
	var adv404 = function() {
		MSPFA.dialog("Error", document.createTextNode("Something's missing! "), ["Go Back"], function() {
			history.back();
		});
	};
	// Change resource URLs to archive links
	var toArchiveURL = function(type, up) {
		if (/^\//.test(up)) {
			// TODO: mspfa relative
			console.warn("found mspfa relative URL in toArchiveURL()", up);
			return up;
		}
		var u = new URL(up, location);
		if (/archive.org$/.test(u.host)) {
			// already edited
			return up;
		}
		if (type === "resource") {
			return "./files/" + u.host + u.pathname + u.search;
		} else if (type === "web") {
			return "https://web.archive.org/web/" + u.href;
		}
	};
	// move random images to clientside
	document.querySelectorAll('footer .mspfalogo').forEach(function(el) {
		var ary = el.dataset.choices.split(',');
		var choice = ary[Math.floor(Math.random() * ary.length)];
		el.style.backgroundImage = "url(\"./assets/random/random.njs." + choice + "\")";
	});
	// [END]

	console.log("This website was programmed almost entirely by Miroware.\nhttps://miroware.io/");
	var magic = {};
	magic.magic = magic;
	console.log(magic);
	// Regular expressions by your lord and savior HiItsMe
	var BBC = [
		[/  /g, "&nbsp;&nbsp;"],
		[/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;"],
		[/\n/g, "<br>"],
		[/\[b\]((?:(?!\[b\]).)*?)\[\/b\]/gi, "<span style=\"font-weight: bolder;\">$1</span>"],
		[/\[i\]((?:(?!\[i\]).)*?)\[\/i\]/gi, "<span style=\"font-style: italic;\">$1</span>"],
		[/\[u\]((?:(?!\[u\]).)*?)\[\/u\]/gi, "<span style=\"text-decoration: underline;\">$1</span>"],
		[/\[s\]((?:(?!\[s\]).)*?)\[\/s\]/gi, "<span style=\"text-decoration: line-through;\">$1</span>"],
		[/\[size=(\d*?)\]((?:(?!\[size=(?:\d*?)\]).)*?)\[\/size\]/gi, "<span style=\"font-size: $1px;\">$2</span>"],
		[/\[color=("?)#?([a-f0-9]{3}(?:[a-f0-9]{3})?)\1\]((?:(?!\[color(?:=[^;]*?)\]).)*?)\[\/color\]/gi, "<span style=\"color: #$2;\">$3</span>"],
		[/\[color=("?)([^";]+?)\1\]((?:(?!\[color(?:=[^;]*?)\]).)*?)\[\/color\]/gi, "<span style=\"color: $2;\">$3</span>"],
		[/\[background=("?)#?([a-f0-9]{3}(?:[a-f0-9]{3})?)\1\]((?:(?!\[background(?:=[^;]*?)\]).)*?)\[\/background\]/gi, "<span style=\"background-color: #$2;\">$3</span>"],
		[/\[background=("?)([^";]+?)\1\]((?:(?!\[background(?:=[^;]*?)\]).)*?)\[\/background\]/gi, "<span style=\"background-color: $2;\">$3</span>"],
		[/\[font=("?)([^";]*?)\1\]((?:(?!\[size(?:=[^;]*?)\]).)*?)\[\/font\]/gi, "<span style=\"font-family: $2;\">$3</span>"],
		[/\[(center|left|right|justify)\]((?:(?!\[\1\]).)*?)\[\/\1\]/gi, "<div style=\"text-align: $1;\">$2</div>"],
		[/\[url\]([^"]*?)\[\/url\]/gi, "<a href=\"$1\">$1</a>"],
		[/\[url=("?)([^"]*?)\1\]((?:(?!\[url(?:=.*?)\]).)*?)\[\/url\]/gi, "<a href=\"$2\">$3</a>"],
		[/\[alt=("?)([^"]*?)\1\]((?:(?!\[alt(?:=.*?)\]).)*?)\[\/alt\]/gi, "<span title=\"$2\">$3</span>"],
		[/\[img\]([^"]*?)\[\/img\]/gi, "<img src=\"$1\">"],
		[/\[img=(\d*?)x(\d*?)\]([^"]*?)\[\/img\]/gi, "<img src=\"$3\" width=\"$1\" height=\"$2\">"],
		[/\[spoiler\]((?:(?!\[spoiler(?: .*?)?\]).)*?)\[\/spoiler\]/gi, "<div class=\"spoiler closed\"><div style=\"text-align: center;\"><input type=\"button\" value=\"Show\" data-close=\"Hide\" data-open=\"Show\"></div><div>$1</div></div>"],
		[/\[spoiler open=("?)([^"]*?)\1 close=("?)([^"]*?)\3\]((?:(?!\[spoiler(?: .*?)?\]).)*?)\[\/spoiler\]/gi, "<div class=\"spoiler closed\"><div style=\"text-align: center;\"><input type=\"button\" value=\"$2\" data-open=\"$2\" data-close=\"$4\"></div><div>$5</div></div>"],
		[/\[spoiler close=("?)([^"]*?)\1 open=("?)([^"]*?)\3\]((?:(?!\[spoiler(?: .*?)?\]).)*?)\[\/spoiler\]/gi, "<div class=\"spoiler closed\"><div style=\"text-align: center;\"><input type=\"button\" value=\"$4\" data-open=\"$4\" data-close=\"$2\"></div><div>$5</div></div>"],
		[/\[flash=(\d*?)x(\d*?)\](.*?)\[\/flash\]/gi, "<object type=\"application/x-shockwave-flash\" data=\"$3\" width=\"$1\" height=\"$2\"></object>"],
		[/\[user\](.+?)\[\/user\]/gi, "<a class=\"usertag\" href=\"/user/?u=$1\" data-userid=\"$1\">@...</a>"]
	];
	var toggleSpoiler = function() {
		if(this.parentNode.parentNode.classList.contains("closed")) {
			this.value = this.getAttribute("data-close");
			this.parentNode.parentNode.classList.remove("closed");
			this.parentNode.parentNode.classList.add("open");
		} else if(this.parentNode.parentNode.classList.contains("open")) {
			this.value = this.getAttribute("data-open");
			this.parentNode.parentNode.classList.remove("open");
			this.parentNode.parentNode.classList.add("closed");
		}
	};
	var idtoken;
	var potentiallyWrongErrorDialog = function(err) {
		var msg = document.createElement("span");
		msg.appendChild(document.createTextNode(err || ""));
		msg.appendChild(document.createElement("br"));
		msg.appendChild(document.createTextNode("If you believe this error message is wrong, please contact the support email at "));
		var contactLink = document.createElement("a");
		contactLink.href = "mailto:support@mspfa.com";
		contactLink.innerText = "support@mspfa.com";
		msg.appendChild(contactLink);
		msg.appendChild(document.createTextNode("."));
		MSPFA.dialog("Error", msg, ["Okay"]);
	};
	var requests = 0;
	var loading = document.querySelector("#loading");
	var box = document.querySelector("#dialog");
	window.MSPFA = {
		import: function(src, loadCallback) {
			var importScript = document.createElement("script");
			importScript.addEventListener("load", function() {
				document.head.removeChild(importScript);
				if(typeof loadCallback == "function") {
					loadCallback();
				}
			});
			importScript.src = src;
			document.head.appendChild(importScript);
		},
		request: function(auth, data, success, error, silent, retry) {
			requests++;
			loading.classList.add("active");
			if(auth) {
				data.token = idtoken;
			}
			var req = new XMLHttpRequest();
			// [BEGIN] riking: Redirect requests to archive data
			switch (data.do) {
				case "story":
					req.open("GET", "./adventure.json", true);
					break;
				// TODO case "user":
				default:
					setTimeout(0, function() {
						if (!silent) {
							MSPFA.dialog("Error", document.createTextNode("Functionality not yet implemented in archive view"), ["Ok"]);
						}
						if (typeof error === "function") {
							error(404);
						}
					});
					return;
			}
			// [END]
			req.setRequestHeader("Accept", "application/json");
			req.onreadystatechange = function() {
				if(req.readyState == XMLHttpRequest.DONE) {
					requests--;
					if(!requests) {
						loading.classList.remove("active");
					}
					if(req.status) {
						statusType = Math.floor(req.status/100);
						if(req.getResponseHeader("X-Magic") == "real" || statusType == 5) {
							if(statusType == 2) {
								var res;
								if(req.responseText) {
									res = JSON.parse(req.responseText);
								}
								if(typeof success == "function") {
									success(res);
								}
							} else if(statusType == 4) {
								switch(req.status) {
									case 400:
										if(!silent) {
											potentiallyWrongErrorDialog("Your request's data is in an invalid format and therefore could not be properly processed or parsed.");
										}
										break;
									case 401:
										if(false && /* riking: disable auto login */ !retry) {
											gapi.auth2.init().then(function(auth2) {
												if(idtoken = auth2.currentUser.get().getAuthResponse().id_token) {
													MSPFA.request(auth, data, success, error, silent, true);
													error = null;
												} else {
													MSPFA.dialog("Error", document.createTextNode("You have been logged out."), ["Log in", "Cancel"], function(output) {
														if(output == "Log in") {
															location.href = "/login/?r=" + encodeURIComponent(location.href);
														}
													});
												}
											});
										} else {
											MSPFA.dialog("Error", document.createTextNode("Your Google login token is invalid or expired, and automatic refreshing has failed. Refresh the page to generate a new login session."), ["Okay"]);
										}
										break;
									case 403:
										if(!silent) {
											potentiallyWrongErrorDialog("You do not have permission to do that.");
										}
										break;
									case 404:
										if(!silent) {
											potentiallyWrongErrorDialog("The resource you are trying to request was not found.");
										}
										break;
									case 429:
										MSPFA.dialog("Error", document.createTextNode("Your client is sending data to MSPFA too quickly. Wait a minute before continuing."), ["Okay"]);
										break;
								}
								if(typeof error == "function") {
									error(req.status);
								}
							} else if(statusType == 5) {
								MSPFA.dialog("Error", document.createTextNode("An error occured on the server (status code " + req.status + "). Please try again soon."), ["Okay"]);
								if(typeof error == "function") {
									error(req.status);
								}
							}
						} else {
							potentiallyWrongErrorDialog("An error occured while trying to load some data. This usually happens because your internet's administrator has blocked this website.");
						}
					}
				}
			};
			var formData = "";
			for(var i in data) {
				formData += (formData ? "&" : "") + encodeURIComponent(i) + "=" + encodeURIComponent(data[i]);
			}
			req.send(formData);
		},
		dialog: function(title, content, buttons, callback) {
			var divs = box.querySelectorAll("div");
			divs[0].innerText = title;
			var output;
			var clickOption = function() {
				output = this.getAttribute("data-value");
				if(typeof callback == "function") {
					callback(output, box);
				}
				box.style.display = "none";
				divs[0].innerHTML = "";
				while(divs[1].lastChild) {
					divs[1].removeChild(divs[1].lastChild);
				}
				while(divs[2].lastChild) {
					divs[2].removeChild(divs[2].lastChild);
				}
			};
			var selectOutput = function() {
				output = this.getAttribute("data-value");
			};
			while(divs[2].lastChild) {
				divs[2].removeChild(divs[2].lastChild);
			}
			for(var i = 0; i < buttons.length; i++) {
				var btn = document.createElement("input");
				btn.classList.add("major");
				btn.value = buttons[i];
				btn.setAttribute("data-value", buttons[i]);
				btn.setAttribute("type", (i == 0) ? "submit" : "button");
				btn.addEventListener("click", clickOption);
				divs[2].appendChild(btn);
				divs[2].appendChild(document.createTextNode(" "));
			}
			while(divs[1].lastChild) {
				divs[1].removeChild(divs[1].lastChild);
			}
			divs[1].appendChild(content);
			box.onsubmit = function(evt) {
				evt.preventDefault();
			};
			box.style.display = "";
		},
		me: {
			s: {
				k: {
					p: 37,
					n: 39,
					s: 32
				}
			},
			t: 0
		},
		slide: [],
		parseBBCode: function(code, noHTML) {
			if(noHTML) {
				code = [code.replace(/</g, "&lt;").replace(/>/g, "&gt;")];
			} else {
				code = code.split(/\<(textarea|style)(?:(?: |\n)(?:.|\n)*?)?\>(?:.|\n)*?\<\/\2\>/gi);
				for(var i = 2; i < code.length; i += 2) {
					code.splice(i, 1);
				}
			}
			for(var i = 0; i < code.length; i += 2) {
				var prevCode;
				while(prevCode != code[i]) {
					prevCode = code[i];
					for(var j = 0; j < BBC.length; j++) {
						code[i] = code[i].replace(BBC[j][0], BBC[j][1]);
					}
				}
			}
			code = code.join("");
			var e = document.createElement("span");
			e.innerHTML = code;
			var es = e.querySelectorAll("*");
			for(var i = es.length-1; i >= 0; i--) {
				if(es[i].tagName == "SCRIPT") {
					es[i].parentNode.removeChild(es[i]);
				} else if(es[i].tagName == "PARAM") {
					if(es[i].name.trim() == "allowScriptAccess") {
						es[i].parentNode.removeChild(es[i]);
					}
				} else {
					for(var j = 0; j < es[i].attributes.length; j++) {
						if(es[i].attributes[j].name.toLowerCase().indexOf("on") == 0 || es[i].attributes[j].value.trim().toLowerCase().indexOf("javascript:") == 0) {
							es[i].removeAttribute(es[i].attributes[j].name);
						}
					}
				}
			}
			try {
				var sins = e.querySelectorAll(".spoiler > div:first-child > input");
				for(var i = 0; i < sins.length; i++) {
					sins[i].addEventListener("click", toggleSpoiler);
				}
				var sdivs = e.querySelectorAll(".spoiler > div:last-child");
				for(var i = 0; i < sdivs.length; i++) {
					var rembrc = true;
					while(rembrc) {
						rembrc = false;
						var rembr = sdivs[i];
						while(rembr = rembr.firstChild) {
							if(rembr.tagName == "BR") {
								rembr.parentNode.removeChild(rembr);
								rembrc = true;
								break;
							}
						}
						rembr = sdivs[i];
						while(rembr = rembr.lastChild) {
							if(rembr.tagName == "BR") {
								rembr.parentNode.removeChild(rembr);
								rembrc = true;
								break;
							}
						}
					}
				}
			} catch(err) {}
			var usertags = e.querySelectorAll("a.usertag");
			for(var i = 0; i < usertags.length; i++) {
				(function(usertag) {
					MSPFA.request(0, {
						do: "user",
						u: usertag.getAttribute("data-userid")
					}, function(user) {
						usertag.innerText = "@" + user.n;
					}, function(status) {
						if(status == 404) {
							usertag.innerText = "<user not found>";
						}
					}, true);
				})(usertags[i]);
			}
			return e;
		}
	};
	var errorBlacklist = [
		"SecurityError",
		"QuotaExceededError",
		"Access is denied.",
		"Not enough storage is available to complete this operation."
	];
	window.addEventListener("error", function(evt) {
		if(!evt.message || navigator.userAgent.toLowerCase().indexOf("bot") != -1) {
			return;
		}
		var error = evt.message.toString();
		var blacklisted = false;
		for(var i = 0; i < errorBlacklist.length; i++) {
			if(error.indexOf(errorBlacklist[i]) == 0) {
				blacklisted = true;
				break;
			}
		}
		blacklisted = true; // riking: do not report JS errors
		if(!blacklisted) {
			if(evt.filename.indexOf(location.origin + "/js/") == 0) {
				if(evt.error && evt.error.stack) {
					error += "\n" + evt.error.stack;
				} else {
					error += "\n    at " + evt.filename + ":" + evt.lineno;
					if(evt.colno) {
						error += ":" + evt.colno;
					}
				}
				var error = error.replace(/  /g, "&nbsp;&nbsp;");
				MSPFA.request(0, {
					do: "error",
					l: location.href,
					e: error,
					u: (MSPFA.me && MSPFA.me.i) ? MSPFA.me.i : undefined
				}, function() {
					var msg = document.createElement("span");
					var err = document.createElement("span");
					err.style.color = "#ff0000";
					err.innerHTML = error.replace(/\n/g, "<br>");
					msg.appendChild(err);
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("This bug has been automatically reported to a programmer so that it can soon be fixed."));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("If this error persists, "));
					var refreshThePage = document.createElement("span");
					refreshThePage.style.fontWeight = "bold";
					refreshThePage.appendChild(document.createTextNode("try refreshing the cache"));
					msg.appendChild(refreshThePage);
					msg.appendChild(document.createTextNode(". There's a chance that it has already been fixed, but you just haven't refreshed."));
					MSPFA.dialog("Error in Code", msg, ["Okay"]);
				});
			}
		}
	});
	var rawParams;
	if(location.href.indexOf("#") != -1) {
		rawParams = location.href.slice(0, location.href.indexOf("#"));
	} else {
		rawParams = location.href;
	}
	if(rawParams.indexOf("?") != -1) {
		rawParams = rawParams.slice(rawParams.indexOf("?")+1).split("&");
	} else {
		rawParams = [];
	}
	var params = {};
	for(var i = 0; i < rawParams.length; i++) {
		try {
			var p = rawParams[i].split("=");
			params[p[0]] = decodeURIComponent(p[1]);
		} catch(err) {}
	}
	if(document.createEvent) {
		Element.prototype.click = function() {
			var evt = document.createEvent("MouseEvents");
			evt.initMouseEvent("click", true, true, window);
			this.dispatchEvent(evt);
		};
	}
	var cleanArrayString = function(str, ints) {
		if(!str) {
			return [];
		}
		str = str.toLowerCase().replace(/( |\n)/g, ",").split(",");
		if(ints) {
			for(var i = 0; i < str.length; i++) {
				str[i] = parseInt(str[i]);
				if(isNaN(str[i]) || str[i] <= 0) {
					str[i] = "";
				}
			}
		}
		while(str.indexOf("") != -1) {
			str.splice(str.indexOf(""), 1);
		}
		for(var i = 0; i < str.length; i++) {
			while(str.indexOf(str[i]) != str.lastIndexOf(str[i])) {
				str.splice(str.lastIndexOf(str[i]), 1);
			}
		}
		return str;
	};
	var fetchDate = function(d, time) {
		var month = (d.getMonth()+1).toString();
		if(month.length == 1) {
			month = "0" + month;
		}
		var day = d.getDate().toString();
		if(day.length == 1) {
			day = "0" + day;
		}
		var year = (d.getFullYear()%100).toString();
		if(year.length == 1) {
			year = "0" + year;
		}
		var msg = month + "/" + day + "/" + year;
		if(time) {
			var min = d.getMinutes().toString();
			if(min.length == 1) {
				min = "0" + min;
			}
			var sec = d.getSeconds().toString();
			if(sec.length == 1) {
				sec = "0" + sec;
			}
			var hour = d.getHours();
			msg += " " + (hour%12 || 12) + ":" + min + ":" + sec + " " + ((hour < 12) ? "AM" : "PM");
		}
		return msg;
	};
	var ums = document.querySelectorAll(".um");
	window.addEventListener("load", function() {
		var blocked = !ums[0];
		var aggress = function(evt) {
			try {
				blocked = blocked || !ums[0].contentDocument || !ums[0].contentDocument.querySelector("img, iframe");
			} catch(err) {}
			if(blocked) {
				if(!evt) {
					if(ums[0] && ums[0].contentWindow) {
						ums[0].contentWindow.addEventListener("load", aggress);
					} else {
						aggress(true);
					}
				} else {
					try {
						document.querySelector("#nopepsi").style.display = "";
						for(var i = 0; i < ums.length; i++) {
							var noum = document.createElement("div");
							noum.classList.add("um");
							noum.style.backgroundImage = "url(\"/images/inconsiderate/random.njs?cb=" + i + "\")";
							ums[i].parentNode.replaceChild(noum, ums[i]);
						}
					} catch(err) {
						console.error(err);
						alert("It seems you are blocking our ads, but we need those ads enabled to be able to fund this website. Please be considerate and enable ads.");
					}
				}
			}
		};
		aggress();
	});
	var getStatus = function(id) {
		return (["Inactive", "Ongoing", "Complete"])[id-1] || "Useless";
	};
	var pageIcon = new Image();
	pageIcon.src = GLOBAL_ASSET_BASEURL + "/images/pages.png"; // riking: global assets
	var heartIcon = new Image();
	heartIcon.src = GLOBAL_ASSET_BASEURL + "/images/heart.png"; // riking: global assets
	pageIcon.classList.add("smol");
	heartIcon.classList.add("smol");
	var edit = document.createElement("input");
	edit.classList.add("edit");
	edit.classList.add("major");
	edit.setAttribute("type", "button");
	edit.title = "Edit";
	edit.style.display = "none";
	var fav = document.createElement("input");
	fav.classList.add("fav");
	fav.classList.add("major");
	fav.classList.add("unlit");
	fav.setAttribute("type", "button");
	fav.title = "Favorite";
	var notify = document.createElement("input");
	notify.classList.add("notify");
	notify.classList.add("major");
	notify.classList.add("unlit");
	notify.setAttribute("type", "button");
	notify.title = "Notify";
	notify.style.display = "none";
	var dynamicImage = function(input, img) {
		if(!img) {
			img = new Image();
		}
		img.addEventListener("error", function() {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("The URL you entered, "));
			var imgl = document.createElement("a");
			imgl.target = "_blank";
			imgl.href = imgl.innerText = input.value;
			msg.appendChild(imgl);
			msg.appendChild(document.createTextNode(", is not a valid image URL. Either the image you are linking does not exist, or your link goes to a page instead of an image."));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("To get an image's URL, right-click it, and then copy its address or location. Paste it into the box to link your image."));
			MSPFA.dialog("Error", msg, ["Okay"]);
		});
		var changeSource = function() {
			if(input.value) {
				img.src = input.value
			} else {
				img.src = GLOBAL_ASSET_BASEURL + "/images/wat/random.njs"; // riking: global assets
			}
		}
		input.addEventListener("change", changeSource);
		changeSource();
	};
	var bbtoolbar = document.querySelector("#bbtoolbar");
	var bbe;
	bbtoolbar.querySelector("input[data-tag=\"b\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[b]" + bbe.value.slice(start, end) + "[/b]" + bbe.value.slice(end);
			bbe.selectionStart = start+3;
			bbe.selectionEnd = end+3;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"i\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[i]" + bbe.value.slice(start, end) + "[/i]" + bbe.value.slice(end);
			bbe.selectionStart = start+3;
			bbe.selectionEnd = end+3;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"u\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[u]" + bbe.value.slice(start, end) + "[/u]" + bbe.value.slice(end);
			bbe.selectionStart = start+3;
			bbe.selectionEnd = end+3;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"s\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[s]" + bbe.value.slice(start, end) + "[/s]" + bbe.value.slice(end);
			bbe.selectionStart = start+3;
			bbe.selectionEnd = end+3;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"color\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Color:"));
			msg.appendChild(document.createElement("br"));
			var color = document.createElement("input");
			color.name = "color";
			color.setAttribute("type", "color");
			msg.appendChild(color);
			msg.appendChild(document.createTextNode(" "));
			var code = document.createElement("input");
			code.name = "code";
			code.setAttribute("type", "text");
			code.size = 8;
			msg.appendChild(code);
			color.addEventListener("change", function() {
				code.value = this.value = this.value.toLowerCase();
			});
			code.addEventListener("change", function() {
				color.value = this.value = this.value.toLowerCase();
			});
			var hex = Math.floor(Math.random()*16777215).toString(16);
			while(hex.length < 6) {
				hex = "0" + hex;
			}
			color.value = code.value = "#" + hex;
			MSPFA.dialog("BBCode: Color", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[color=" + form.code.value.toLowerCase() + "]";
					bbe.value = bbe.value.slice(0, start) + pre + bbe.value.slice(start, end) + "[/color]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = end+pre.length;
				}
			});
			color.focus();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"background\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Color:"));
			msg.appendChild(document.createElement("br"));
			var color = document.createElement("input");
			color.name = "color";
			color.setAttribute("type", "color");
			msg.appendChild(color);
			msg.appendChild(document.createTextNode(" "));
			var code = document.createElement("input");
			code.name = "code";
			code.setAttribute("type", "text");
			code.size = 8;
			msg.appendChild(code);
			color.addEventListener("change", function() {
				code.value = this.value = this.value.toLowerCase();
			});
			code.addEventListener("change", function() {
				color.value = this.value = this.value.toLowerCase();
			});
			var hex = Math.floor(Math.random()*16777215).toString(16);
			while(hex.length < 6) {
				hex = "0" + hex;
			}
			color.value = code.value = "#" + hex;
			MSPFA.dialog("BBCode: Background", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[background=" + form.color.value + "]";
					bbe.value = bbe.value.slice(0, start) + pre + bbe.value.slice(start, end) + "[/background]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = end+pre.length;
				}
			});
			color.focus();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"size\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Font size:"));
			msg.appendChild(document.createElement("br"));
			var size = document.createElement("input");
			size.name = "size";
			size.setAttribute("type", "number");
			size.value = "14";
			size.min = 0;
			size.step = "any";
			size.required = true;
			msg.appendChild(size);
			MSPFA.dialog("BBCode: Size", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[size=" + form.size.value + "]";
					bbe.value = bbe.value.slice(0, start) + pre + bbe.value.slice(start, end) + "[/size]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = end+pre.length;
				}
			});
			size.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"font\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Font:"));
			msg.appendChild(document.createElement("br"));
			var rad1 = document.createElement("input");
			rad1.name = "source";
			rad1.setAttribute("type", "radio");
			rad1.value = "preset";
			rad1.checked = true;
			msg.appendChild(rad1);
			msg.appendChild(document.createTextNode(" Use font preset: "));
			var preset = document.createElement("select");
			preset.name = "preset";
			var fonts = {
				"Sans-serif": ["Arial", "Calibri", "Candara", "Century Gothic", "Comic Sans MS", "Helvetica", "Impact", "Segoe UI", "Tahoma", "Trebuchet MS", "Verdana"],
				"Serif": ["Bodoni MT", "Book Antiqua", "Cambria", "Garamond", "Georgia", "Goudy Old Style", "Lucida Bright", "Perpetua", "Rockwell", "Times New Roman"],
				"Monospaced": ["Consolas", "Courier New", "Lucida Console", "Lucida Sans Typewriter"]
			};
			for(var i in fonts) {
				var optgroup = document.createElement("optgroup");
				optgroup.label = i;
				for(var j = 0; j < fonts[i].length; j++) {
					var option = document.createElement("option");
					option.value = option.style.fontFamily = option.innerText = fonts[i][j];
					optgroup.appendChild(option);
				}
				preset.appendChild(optgroup);
			}
			msg.appendChild(preset);
			msg.appendChild(document.createElement("br"));
			var rad2 = document.createElement("input");
			rad2.name = "source";
			rad2.setAttribute("type", "radio");
			rad2.value = "custom";
			msg.appendChild(rad2);
			msg.appendChild(document.createTextNode(" Use alternate font: "));
			var custom = document.createElement("input");
			custom.name = "custom";
			custom.setAttribute("type", "text");
			msg.appendChild(custom);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Preview:"));
			msg.appendChild(document.createElement("br"));
			var preview = document.createElement("textarea");
			preview.rows = 4;
			preview.style.width = "100%";
			preview.style.boxSizing = "border-box";
			preview.value = "The quick brown fox jumps over the lazy dog.";
			msg.appendChild(preview);
			preset.addEventListener("change", function() {
				if(this.form.source.value == "preset") {
					preview.style.fontFamily = this.value;
				}
			});
			custom.addEventListener("change", function() {
				if(this.form.source.value == "custom") {
					preview.style.fontFamily = this.value;
				}
			});
			preview.style.fontFamily = preset.value = "Courier New";
			MSPFA.dialog("BBCode: Font", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[font=" + form.preset.value + "]";
					if(form.source.value == "custom") {
						pre = "[font=" + form.custom.value + "]";
					}
					bbe.value = bbe.value.slice(0, start) + pre + bbe.value.slice(start, end) + "[/font]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = end+pre.length;
				}
			});
			preset.focus();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"left\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[left]" + bbe.value.slice(start, end) + "[/left]" + bbe.value.slice(end);
			bbe.selectionStart = start+6;
			bbe.selectionEnd = end+6;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"center\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[center]" + bbe.value.slice(start, end) + "[/center]" + bbe.value.slice(end);
			bbe.selectionStart = start+8;
			bbe.selectionEnd = end+8;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"right\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[right]" + bbe.value.slice(start, end) + "[/right]" + bbe.value.slice(end);
			bbe.selectionStart = start+7;
			bbe.selectionEnd = end+7;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"justify\"]").addEventListener("click", function() {
		if(bbe) {
			bbe.focus();
			var start = bbe.selectionStart;
			var end = bbe.selectionEnd;
			bbe.value = bbe.value.slice(0, start) + "[justify]" + bbe.value.slice(start, end) + "[/justify]" + bbe.value.slice(end);
			bbe.selectionStart = start+9;
			bbe.selectionEnd = end+9;
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"link\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Target URL:"));
			msg.appendChild(document.createElement("br"));
			var url = document.createElement("input");
			url.name = "url";
			url.setAttribute("type", "url");
			url.required = true;
			msg.appendChild(url);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Content:"));
			msg.appendChild(document.createElement("br"));
			var text = document.createElement("input");
			text.name = "text";
			text.setAttribute("type", "text");
			text.value = bbe.value.slice(bbe.selectionStart, bbe.selectionEnd);
			msg.appendChild(text);
			MSPFA.dialog("BBCode: Link", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					if(form.url.value == form.text.value || !form.text.value) {
						bbe.value = bbe.value.slice(0, start) + "[url]" + form.url.value + "[/url]" + bbe.value.slice(end);
						bbe.selectionStart = start+form.url.value.length+11;
						bbe.selectionEnd = start+form.url.value.length+11;
					} else {
						var pre = "[url=" + form.url.value + "]";
						bbe.value = bbe.value.slice(0, start) + pre + form.text.value + "[/url]" + bbe.value.slice(end);
						bbe.selectionStart = start+pre.length;
						bbe.selectionEnd = start+pre.length+form.text.value.length;
					}
				}
			});
			url.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"alt\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Alt text:"));
			msg.appendChild(document.createElement("br"));
			var alt = document.createElement("input");
			alt.name = "alt";
			alt.setAttribute("type", "text");
			alt.required = true;
			msg.appendChild(alt);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Content:"));
			msg.appendChild(document.createElement("br"));
			var text = document.createElement("input");
			text.name = "text";
			text.setAttribute("type", "text");
			text.value = bbe.value.slice(bbe.selectionStart, bbe.selectionEnd);
			msg.appendChild(text);
			MSPFA.dialog("BBCode: Alt Text", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[alt=" + form.alt.value + "]";
					bbe.value = bbe.value.slice(0, start) + pre + form.text.value + "[/alt]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = start+pre.length+form.text.value.length;
				}
			});
			alt.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"img\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Image source URL:"));
			msg.appendChild(document.createElement("br"));
			var src = document.createElement("input");
			src.name = "src";
			src.setAttribute("type", "url");
			src.required = true;
			dynamicImage(src);
			msg.appendChild(src);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Image size:"));
			msg.appendChild(document.createElement("br"));
			var rad1 = document.createElement("input");
			rad1.name = "size";
			rad1.setAttribute("type", "radio");
			rad1.value = "natural";
			rad1.checked = true;
			msg.appendChild(rad1);
			msg.appendChild(document.createTextNode(" Use natural image size"));
			msg.appendChild(document.createElement("br"));
			var rad2 = document.createElement("input");
			rad2.name = "size";
			rad2.setAttribute("type", "radio");
			rad2.value = "set";
			msg.appendChild(rad2);
			msg.appendChild(document.createTextNode(" Use size: "));
			var width = document.createElement("input");
			width.name = "width";
			width.setAttribute("type", "number");
			width.title = "Width";
			width.min = 0;
			width.step = "any";
			width.value = "650";
			width.style.width = "5em";
			msg.appendChild(width);
			msg.appendChild(document.createTextNode("x"));
			var height = document.createElement("input");
			height.name = "height";
			height.setAttribute("type", "number");
			height.title = "Height";
			height.min = 0;
			height.step = "any";
			height.value = "450";
			height.style.width = "5em";
			msg.appendChild(height);
			MSPFA.dialog("BBCode: Image", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[img]";
					if(form.size.value == "set" && !isNaN(parseFloat(form.width.value)) && !isNaN(parseFloat(form.height.value))) {
						pre = "[img=" + form.width.value + "x" + form.height.value + "]";
					}
					bbe.value = bbe.value.slice(0, start) + pre + form.src.value + "[/img]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length+form.src.value.length+6;
					bbe.selectionEnd = start+pre.length+form.src.value.length+6;
				}
			});
			src.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"spoiler\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Open button text:"));
			msg.appendChild(document.createElement("br"));
			var open = document.createElement("input");
			open.name = "open";
			open.setAttribute("type", "text");
			open.value = "Show";
			open.placeholder = "Show Pesterlog";
			msg.appendChild(open);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Close button text:"));
			msg.appendChild(document.createElement("br"));
			var close = document.createElement("input");
			close.name = "close";
			close.setAttribute("type", "text");
			close.value = "Hide";
			close.placeholder = "Hide Pesterlog";
			msg.appendChild(close);
			MSPFA.dialog("BBCode: Spoiler", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[spoiler]";
					if(!form.open.value) {
						form.open.value = "Show";
					}
					if(!form.close.value) {
						form.close.value = "Hide";
					}
					if(form.open.value != "Show" || form.close.value != "Hide") {
						pre = "[spoiler open=\"" + form.open.value + "\" close=\"" + form.close.value + "\"]";
					}
					bbe.value = bbe.value.slice(0, start) + pre + bbe.value.slice(start, end) + "[/spoiler]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length;
					bbe.selectionEnd = end+pre.length;
				}
			});
			open.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"flash\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			var warn = document.createElement("span");
			warn.style.fontWeight = "bold";
			warn.appendChild(document.createTextNode("It is highly recommended that you do not use Flash in your adventure due to its progressive loss of support. You should use a video or a JavaScript canvas instead."));
			msg.appendChild(warn);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Flash embed source URL:"));
			msg.appendChild(document.createElement("br"));
			var src = document.createElement("input");
			src.name = "src";
			src.setAttribute("type", "url");
			src.required = true;
			msg.appendChild(src);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Embed size:"));
			msg.appendChild(document.createElement("br"));
			var width = document.createElement("input");
			width.name = "width";
			width.setAttribute("type", "number");
			width.title = "Width";
			width.min = 0;
			width.step = "any";
			width.value = "650";
			width.required = true;
			width.style.width = "5em";
			msg.appendChild(width);
			msg.appendChild(document.createTextNode("x"));
			var height = document.createElement("input");
			height.name = "height";
			height.setAttribute("type", "number");
			height.title = "Height";
			height.min = 0;
			height.step = "any";
			height.value = "450";
			height.required = true;
			height.style.width = "5em";
			msg.appendChild(height);
			MSPFA.dialog("BBCode: Flash", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					var pre = "[flash=" + form.width.value + "x" + form.height.value + "]";
					bbe.value = bbe.value.slice(0, start) + pre + form.src.value + "[/flash]" + bbe.value.slice(end);
					bbe.selectionStart = start+pre.length+form.src.value.length+8;
					bbe.selectionEnd = start+pre.length+form.src.value.length+8;
				}
			});
			src.select();
		}
	});
	bbtoolbar.querySelector("input[data-tag=\"user\"]").addEventListener("click", function() {
		if(bbe) {
			var msg = document.createElement("span");
			msg.appendChild(document.createTextNode("Using this will send a notification to the tagged user if they have their notifications enabled. If you just want to reference them, use a link to their user page instead of tagging them here."));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Username:"));
			msg.appendChild(document.createElement("br"));
			var username = document.createElement("input");
			username.name = "username";
			username.setAttribute("type", "text");
			username.maxlength = 50;
			msg.appendChild(username);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("Matching users:"));
			msg.appendChild(document.createElement("br"));
			var ut = document.createElement("table");
			ut.style.width = "100%";
			var userlist = document.createElement("tbody");
			var tr = document.createElement("tr");
			var td = document.createElement("td");
			td.appendChild(document.createTextNode("No matching users were found."));
			tr.appendChild(td);
			userlist.appendChild(tr);
			ut.appendChild(userlist);
			msg.appendChild(ut);
			msg.appendChild(document.createElement("br"));
			msg.appendChild(document.createTextNode("User ID:"));
			msg.appendChild(document.createElement("br"));
			var userid = document.createElement("input");
			userid.name = "userid";
			userid.setAttribute("type", "text");
			userid.size = 21;
			userid.required = true;
			userid.addEventListener("focus", function() {
				this.select();
			});
			msg.appendChild(userid);
			username.addEventListener("keyup", function() {
				MSPFA.request(0, {
					do: "users",
					n: username.value,
					m: 5
				}, function(users) {
					while(userlist.lastChild) {
						userlist.removeChild(userlist.lastChild);
					}
					if(users.length) {
						for(var i = 0; i < users.length; i++) {
							(function(user) {
								var tr = document.createElement("tr");
								var td1 = document.createElement("td");
								td1.style.width = "64px";
								var img = new Image();
								img.classList.add("cellicon");
								img.src = user.o || "/images/wat/random.njs?cb=" + user.i;
								img.style.width = img.style.height = "32px";
								td1.appendChild(img);
								tr.appendChild(td1);
								var td2 = document.createElement("td");
								var username = document.createElement("a");
								username.classList.add("major");
								username.href = "javascript:void(0);";
								username.innerText = user.n;
								username.addEventListener("click", function() {
									userid.value = user.i;
								});
								username.addEventListener("dblclick", function() {
									document.querySelectorAll("#dialog div")[2].firstChild.click();
								});
								td2.appendChild(username);
								tr.appendChild(td2);
								userlist.appendChild(tr);
							})(users[i]);
						}
					} else {
						var tr = document.createElement("tr");
						var td = document.createElement("td");
						td.appendChild(document.createTextNode("No matching users were found."));
						tr.appendChild(td);
						userlist.appendChild(tr);
					}
				});
			});
			MSPFA.dialog("BBCode: User", msg, ["Okay", "Cancel"], function(output, form) {
				if(output == "Okay") {
					bbe.focus();
					var start = bbe.selectionStart;
					var end = bbe.selectionEnd;
					bbe.value = bbe.value.slice(0, start) + "[user]" + form.userid.value + "[/user]" + bbe.value.slice(end);
					bbe.selectionStart = start+form.userid.value.length+13;
					bbe.selectionEnd = start+form.userid.value.length+13;
				}
			});
			username.select();
		}
	});
	var achievements = [
		["Enter name.", "Start your first adventure"],
		["Tentative Storyteller", "Reach 10 favorites on one of your adventures"],
		["Distant Admiration", "Reach 100 favorites on one of your adventures"],
		["What will you do?", "Reach 413 favorites on one of your adventures"],
		["Unobtainable by Virtue", "Reach 1000 favorites on one of your adventures"],
		["Pure Magic", "Program and apply useful JavaScript to an adventure"],
		["Helpful Contribution", "Contribute to the website in a unique and helpful manner"],
		["Administrative Endorsement", "Gain official approval from an administrator"],
		["Loyal Patron", "Donate some money to MSPFA"],
		["The Yellow Yard", "Hack your way into acquiring this achievement"]
	];
	var updateFav = function() {
		// [BEGIN] riking: disable favorite button
		MSPFA.dialog("Error", document.createTextNode("Favoriting is not allowed on archival copies."), ["Close"]);
		return;
		// [END]
		var t = this;
		if(!t.disabled) {
			if(!idtoken || MSPFA.me.f) {
				MSPFA.dialog("Error", document.createTextNode("You must be logged in to add adventures to your favorites."), ["Log in", "Cancel"], function(output) {
					if(output == "Log in") {
						location.href = "/login/?r=" + encodeURIComponent(location.href);
					}
				});
			} else {
				t.disabled = true;
				MSPFA.request(1, {
					do: "fav",
					s: t._s.i
				}, function(state) {
					if(state) {
						t.classList.remove("unlit");
						t.classList.add("lit");
						t.nextSibling.nextSibling.classList.remove("unlit");
						t.nextSibling.nextSibling.classList.add("lit");
						t.nextSibling.nextSibling.style.display = "";
					} else {
						t.classList.remove("lit");
						t.classList.add("unlit");
						t.nextSibling.nextSibling.classList.remove("lit");
						t.nextSibling.nextSibling.classList.add("unlit");
						t.nextSibling.nextSibling.style.display = "none";
					}
					t.disabled = false;
				});
			}
		}
	};
	var updateNotify = function() {
		// [BEGIN] riking: disable notifications
		MSPFA.dialog("Error", document.createTextNode("Notifications are not allowed on archival copies."), ["Close"]);
		return;
		// [END]
		var t = this;
		if(!t.disabled) {
			if(!idtoken || MSPFA.me.f) {
				MSPFA.dialog("Error", document.createTextNode("You must be logged in to enable notifications for adventures."), ["Log in", "Cancel"], function(output) {
					if(output == "Log in") {
						location.href = "/login/?r=" + encodeURIComponent(location.href);
					}
				});
			} else {
				t.disabled = true;
				MSPFA.request(1, {
					do: "notify",
					s: t.previousSibling.previousSibling._s.i
				}, function(state) {
					if(state) {
						t.classList.remove("unlit");
						t.classList.add("lit");
					} else {
						t.classList.remove("lit");
						t.classList.add("unlit");
					}
					t.disabled = false;
				});
			}
		}
	};
	var getStoryCell = function(story) {
		var tr = document.createElement("tr");
		var td1 = document.createElement("td");
		td1.style.verticalAlign = "top";
		var imga = document.createElement("a");
		imga.href = "/?s=" + story.i + "&p=1";
		var img = new Image();
		img.classList.add("cellicon");
		img.src = story.o || (GLOBAL_ASSET_BASEURL + "/images/wat/random.njs?cb=" + story.i); // riking: global assets
		imga.appendChild(img);
		td1.appendChild(imga);
		tr.appendChild(td1);
		var td2 = document.createElement("td");
		var t = document.createElement("a");
		t.classList.add("major");
		t.href = "/?s=" + story.i + "&p=1";
		t.innerText = story.n;
		td2.appendChild(t);
		td2.appendChild(document.createTextNode(" "));
		var sedit = edit.cloneNode(false);
		if(idtoken && (story.e.indexOf(MSPFA.me.i) != -1 || MSPFA.me.p)) {
			sedit.style.display = "";
		}
		sedit.addEventListener("click", function() {
			location.href = "/my/stories/info/?s=" + story.i;
		});
		td2.appendChild(sedit);
		td2.appendChild(document.createTextNode(" "));
		var sfav = fav.cloneNode(false);
		sfav._s = story;
		sfav.addEventListener("click", updateFav);
		td2.appendChild(sfav);
		td2.appendChild(document.createTextNode(" "));
		var snotify = notify.cloneNode(false);
		snotify.addEventListener("click", updateNotify);
		td2.appendChild(snotify);
		var gi = story.g.indexOf(MSPFA.me.i);
		if(idtoken && (story.f.indexOf(MSPFA.me.i) != -1 || gi != -1)) {
			sfav.classList.remove("unlit");
			sfav.classList.add("lit");
			snotify.style.display = "";
			if(gi != -1) {
				snotify.classList.remove("unlit");
				snotify.classList.add("lit");
			}
		}
		td2.appendChild(document.createElement("br"));
		td2.appendChild(document.createTextNode(getStatus(story.h) + " "));
		td2.appendChild(pageIcon.cloneNode(false));
		td2.appendChild(document.createTextNode(story.p + " "));
		td2.appendChild(heartIcon.cloneNode(false));
		td2.appendChild(document.createTextNode(story.f.length+story.g.length));
		td2.appendChild(document.createElement("br"));
		if(story.t.length) {
			td2.appendChild(document.createTextNode("Tags: " + story.t.join(", ")));
		} else {
			td2.appendChild(document.createTextNode("No tags"));
		}
		tr.appendChild(td2);
		return tr;
	};
	var getUserCell = function(user) {
		var tr = document.createElement("tr");
		var td1 = document.createElement("td");
		var imga = document.createElement("a");
		imga.href = "/user/?u=" + user.i;
		var img = new Image();
		img.classList.add("cellicon");
		img.src = user.o || "/images/wat/random.njs?cb=" + user.i;
		imga.appendChild(img);
		td1.appendChild(imga);
		tr.appendChild(td1);
		var td2 = document.createElement("td");
		var username = document.createElement("a");
		username.classList.add("major");
		username.href = "/user/?u=" + user.i;
		username.innerText = user.n;
		td2.appendChild(username);
		tr.appendChild(td2);
		return tr;
	};
	var oldUser = false;
	var relog;
	var notification = document.querySelector("#notification");
	var iconLink = document.querySelector("link[rel=\"icon\"]");
	var loadNotifications = function() {
		if(false && /* riking: disable notifications */ gapi.auth2.init().isSignedIn.get()) {
			MSPFA.request(1, {
				do: "notifications"
			}, function(ns) {
				if(ns) {
					notification.innerText = ns.toString();
					notification.style.display = "";
					iconLink.href = "/images/icon.png";
					if(location.pathname == "/my/") {
						document.querySelector("#messages").innerText = "Messages (" + ns + ")";
					}
				} else {
					notification.innerText = "0";
					notification.style.display = "none";
					iconLink.href = "/images/ico.png";
					if(location.pathname == "/my/") {
						document.querySelector("#messages").innerText = "Messages";
					}
				}
			});
		} else {
			clearInterval(relog);
			idtoken = null;
		}
	};
	var login = function(d) {
		if(!d) {
			gapi.auth2.getAuthInstance().signOut();
			idtoken = null;
			if(oldUser) {
				MSPFA.dialog("Error", document.createTextNode("The provided password is invalid."), ["Okay"]);
			} else if(location.pathname.indexOf("/my/") == 0) {
				location.replace("/login/?r=" + location.href.slice(location.origin.length));
			}
		} else if(location.pathname == "/login/") {
			if(d.f) {
				var finalStep = function() {
					setTimeout(function() {
						var msg = document.createElement("span");
						msg.appendChild(document.createTextNode("Do you agree to the "));
						var tosLink = document.createElement("a");
						tosLink.href = "/tos/";
						tosLink.target = "_blank";
						tosLink.innerText = "terms of service";
						msg.appendChild(tosLink);
						msg.appendChild(document.createTextNode("?"));
						MSPFA.dialog("Login", msg, ["Yes", "No"], function(output) {
							if(output == "No") {
								gapi.auth2.getAuthInstance().signOut();
								setTimeout(function() {
									MSPFA.dialog("Login", document.createTextNode("Come back when you're ready to agree to the terms of service."), ["Okay"]);
								});
							} else if(output == "Yes") {
								MSPFA.request(1, {
									do: "agree"
								}, function() {
									location.replace("/my/profile/");
								});
							}
						});
					});
				};
				MSPFA.dialog("Login", document.createTextNode("Are you under the age of 13 years?"), ["Yes", "No"], function(output) {
					if(output == "No") {
						finalStep();
					} else if(output == "Yes") {
						setTimeout(function() {
							MSPFA.dialog("Login", document.createTextNode("Have you received permission from a parent or guardian to use this website?"), ["Yes", "No"], function(output2) {
								if(output2 == "No") {
									gapi.auth2.getAuthInstance().signOut();
									setTimeout(function() {
										MSPFA.dialog("Login", document.createTextNode("Come back when you've received consent from a parent or guardian."), ["Okay"]);
									});
								} else if(output2 == "Yes") {
									finalStep();
								}
							});
						});
					}
				});
			} else {
				location.replace(params.r || "/my/");
			}
		} else if(location.pathname.indexOf("/my/") == 0 && d.f) {
			location.replace("/login/");
		} else {
			MSPFA.me = d;
			if(location.pathname != "/my/messages/" && location.pathname != "/my/messages/view/") {
				loadNotifications();
			}
			/*
			var theme = document.querySelector("#theme");
			var themeLink = "/css/theme" + MSPFA.me.s.t + ".css";
			if(theme.href != themeLink) {
				document.cookie = "t=" + MSPFA.me.s.t + "; path=/;";
				theme.href = themeLink;
			}
			*/
			if(location.pathname == "/" && params.s != undefined) {
				var rates = document.querySelectorAll("#commentbox .rate input[type=\"button\"].up");
				for(var i = 0; i < rates.length; i++) {
					if(rates[i].parentNode.parentNode.parentNode._c.l && rates[i].parentNode.parentNode.parentNode._c.l.indexOf(MSPFA.me.i) != -1) {
						rates[i].classList.remove("unlit");
						rates[i].classList.add("lit");
					} else if(rates[i].parentNode.parentNode.parentNode._c.n && rates[i].parentNode.parentNode.parentNode._c.n.indexOf(MSPFA.me.i) != -1) {
						rates[i].nextSibling.nextSibling.classList.remove("unlit");
						rates[i].nextSibling.nextSibling.classList.add("lit");
					}
				}
			} else if(location.pathname == "/my/") {
				var username = document.querySelector("#username");
				username.innerText = "Welcome " + MSPFA.me.n + "!";
				var logout = document.querySelector("#logout");
				logout.href = "javascript:void(0);";
				logout.addEventListener("click", function() {
					gapi.auth2.getAuthInstance().signOut().then(function() {
						location.href = "/login/";
					});
				});
				document.querySelector("#viewprofile").href = "/user/?u=" + MSPFA.me.i;
				document.querySelector("#editprofile").href = "/my/profile/";
				document.querySelector("#settings").href = "/my/settings/";
				document.querySelector("#editstories").href = "/my/stories/";
				document.querySelector("#favstories").href = "/favs/?u=" + MSPFA.me.i;
				document.querySelector("#messages").href = "/my/messages/";
				document.querySelector("#achievements").href = "/achievements/?u=" + MSPFA.me.i;
			} else if(location.pathname == "/my/profile/") {
				document.querySelector("#userid").value = MSPFA.me.i;
				var editprofile = document.querySelector("#editprofile");
				var saveprofile = document.querySelector("#saveprofile");
				var unsaved = false;
				window.onbeforeunload = function() {
					if(unsaved) {
						return true;
					}
				};
				var setUnsaved = function() {
					unsaved = true;
					if(saveprofile.disabled) {
						saveprofile.disabled = false;
					}
				};
				for(var i = 0; i < editprofile.elements.length; i++) {
					if(editprofile.elements[i].name) {
						editprofile.elements[i].addEventListener("keydown", setUnsaved);
						editprofile.elements[i].addEventListener("change", setUnsaved);
					}
				}
				var username = document.querySelector("#username");
				username.innerText = MSPFA.me.n;
				username.href = "/user/?u=" + MSPFA.me.i;
				editprofile.username.value = MSPFA.me.n;
				editprofile.useremail.value = MSPFA.me.m;
				if(MSPFA.me.h) {
					editprofile.usershowemail.checked = true;
				}
				editprofile.usersite.value = MSPFA.me.w;
				editprofile.userdesc.value = MSPFA.me.r;
				editprofile.usericon.value = MSPFA.me.o;
				dynamicImage(editprofile.usericon, document.querySelector("#usericon"));
				var sendVerification = function() {
					MSPFA.request(1, {
						do: "email",
						r: 1
					}, function() {
						MSPFA.dialog("Email", document.createTextNode("A verification email has been sent to " + editprofile.useremail.value + ". To verify your email, paste the code onto this page after pressing \"Okay\". If you don't see the email in your inbox, check your spam folder."), ["Okay"], function() {
							setTimeout(verifyEmail);
						});
					});
				};
				var verifyEmail = function() {
					var msg = document.createElement("span");
					msg.appendChild(document.createTextNode("Enter your email verification code below."));
					msg.appendChild(document.createElement("br"));
					var code = document.createElement("input");
					code.setAttribute("type", "text");
					code.placeholder = "ABCD1234";
					msg.appendChild(code);
					MSPFA.dialog("Email", msg, ["Verify", "Resend Code", "Cancel"], function(output) {
						if(output == "Verify") {
							MSPFA.request(1, {
								do: "email",
								v: code.value
							}, function(v) {
								if(v) {
									MSPFA.dialog("Email", document.createTextNode("Your email has been successfully verified!"), ["Okay"]);
								} else {
									MSPFA.dialog("Email", document.createTextNode("Your email verification code is invalid or expired."), ["Okay"], function() {
										setTimeout(function() {
											verifyEmail();
										});
									});
								}
							});
						} else if(output == "Resend Code") {
							sendVerification();
						}
					});
				};
				if(MSPFA.me.m && !MSPFA.me.v) {
					verifyEmail();
				}
				editprofile.addEventListener("submit", function(evt) {
					evt.preventDefault();
					MSPFA.request(1, {
						do: "profile",
						n: editprofile.username.value,
						m: editprofile.useremail.value,
						h: editprofile.usershowemail.checked ? 1 : 0,
						w: editprofile.usersite.value,
						r: editprofile.userdesc.value,
						o: editprofile.usericon.value
					}, function() {
						unsaved = false;
						saveprofile.disabled = true;
						username.innerText = editprofile.username.value;
						if(MSPFA.me.m != editprofile.useremail.value) {
							MSPFA.me.m = editprofile.useremail.value;
							sendVerification();
						}
					});
				});
				editprofile.style.opacity = "";
			} else if(location.pathname == "/my/stories/") {
				document.querySelector("#newstory").href = "/my/stories/info/?s=new";
				MSPFA.request(0, {
					do: "editor",
					u: MSPFA.me.i
				}, function(s) {
					if(s.length) {
						s = s.sort(function(a, b) {
							return (b.f.length+b.g.length)-(a.f.length+a.g.length);
						});
						var stories = document.querySelector("#stories");
						for(var i = 0; i < s.length; i++) {
							var tr = document.createElement("tr");
							tr._i = s[i].i;
							var td1 = document.createElement("td");
							var img = new Image();
							img.classList.add("cellicon");
							img.src = s[i].o || "/images/wat/random.njs?cb=" + s[i].i;
							td1.appendChild(img);
							tr.appendChild(td1);
							var td2 = document.createElement("td");
							var t = document.createElement("a");
							t.classList.add("major");
							if(s[i].p) {
								t.href = "/?s=" + s[i].i + "&p=1";
							}
							t.innerText = s[i].n;
							td2.appendChild(t);
							td2.appendChild(document.createElement("br"));
							var sbtn = document.createElement("input");
							sbtn.classList.add("major");
							sbtn.setAttribute("type", "button");
							sbtn.value = "Edit Info";
							sbtn.addEventListener("click", function() {
								location.href = "/my/stories/info/?s=" + this.parentNode.parentNode._i;
							});
							td2.appendChild(sbtn);
							td2.appendChild(document.createTextNode(" "));
							var pbtn = document.createElement("input");
							pbtn.classList.add("major");
							pbtn.setAttribute("type", "button");
							pbtn.value = "Edit Pages";
							pbtn.addEventListener("click", function() {
								location.href = "/my/stories/pages/?s=" + this.parentNode.parentNode._i;
							});
							td2.appendChild(pbtn);
							tr.appendChild(td2);
							stories.appendChild(tr);
						}
						stories.parentNode.parentNode.parentNode.style.display = "";
					}
				});
			} else if(location.pathname == "/my/stories/info/") {
				var story = {};
				var editstory = document.querySelector("#editstory");
				var savestory = document.querySelector("#savestory");
				var unsaved = false;
				window.onbeforeunload = function() {
					if(unsaved) {
						return true;
					}
				};
				var setUnsaved = function() {
					unsaved = true;
					if(savestory.disabled) {
						savestory.disabled = false;
					}
				};
				for(var i = 0; i < editstory.elements.length; i++) {
					if(editstory.elements[i].name) {
						editstory.elements[i].addEventListener("keydown", setUnsaved);
						editstory.elements[i].addEventListener("change", setUnsaved);
					}
				}
				var deletestory = document.querySelector("#deletestory");
				var editpages = document.querySelector("#editpages");
				editpages.addEventListener("click", function() {
					try {
						location.href = "/my/stories/pages/?s=" + story.i;
					} catch(err) {}
				});
				var userfavs = document.querySelector("#userfavs");
				userfavs.addEventListener("click", function() {
					try {
						location.href = "/readers/?s=" + story.i;
					} catch(err) {}
				});
				var grantuser = document.querySelector("#grantuser");
				var grantuserbtn = document.querySelector("#grantuserbtn");
				var mirrorers = document.querySelector("#storymirrorers");
				var tagselect = document.querySelector("#tagselect");
				document.querySelector("#taghelp").addEventListener("click", function() {
					var tip = document.createElement("span");
					if(tagselect.value) {
						tip.appendChild(document.createTextNode(tagselect.value + ":"));
						tip.appendChild(document.createElement("br"));
					}
					tip.appendChild(document.createTextNode(tagselect.options[tagselect.selectedIndex].title));
					MSPFA.dialog("Tip", tip, ["Okay"]);
				});
				document.querySelector("#tagadd").addEventListener("click", function() {
					var tags = [];
					if(editstory.storytags.value) {
						tags = editstory.storytags.value.split(",");
					}
					if(tagselect.value && tags.indexOf(tagselect.value) == -1) {
						tags.push(tagselect.value);
						setUnsaved();
					}
					editstory.storytags.value = tags.join(",");
					tagselect.options[0].selected = true;
				});
				var editors = [];
				var revokeUser = function() {
					var t = this;
					var a = t.parentNode.firstChild;
					MSPFA.dialog("Confirm", document.createTextNode("Are you sure you want to revoke editing permission from " + a.innerText + "?"), ["Yes", "No"], function(output) {
						if(output == "Yes") {
							editors.splice(editors.indexOf(a._u), 1);
							t.parentNode.parentNode.removeChild(t.parentNode);
							setUnsaved();
						}
					});
				};
				var addMirrorer = function(id) {
					MSPFA.request(0, {
						do: "user",
						u: id
					}, function(user) {
						if(editors.indexOf(user.i) == -1) {
							editors.push(user.i);
							var span = document.createElement("span");
							var a = document.createElement("a");
							a._u = user.i;
							a.href = "/user/?u=" + user.i;
							a.innerText = user.n;
							span.appendChild(a);
							if(user.i != story.c) {
								if(MSPFA.me.i == story.c || MSPFA.me.p) {
									span.appendChild(document.createTextNode(" "));
									var x = document.createElement("input");
									x.classList.add("major");
									x.setAttribute("type", "button");
									x.value = "x";
									x.style.padding = "0";
									x.addEventListener("click", revokeUser);
									span.appendChild(x);
								}
								mirrorers.insertBefore(span, grantuser.parentNode);
							} else {
								mirrorers.insertBefore(span, mirrorers.firstChild);
							}
							span.appendChild(document.createElement("br"));
						} else {
							MSPFA.dialog("Error", document.createTextNode("That user has already been granted editing permission."), ["Okay"]);
						}
					}, function(status) {
						if(status == 404) {
							MSPFA.dialog("Error", document.createTextNode("User not found."), ["Okay"]);
						}
					}, true);
				};
				grantuserbtn.addEventListener("click", function() {
					if(!grantuser.value) {
						grantuser.focus();
					} else {
						addMirrorer(grantuser.value);
						grantuser.value = "";
						grantuser.focus();
						setUnsaved();
					}
				});
				document.querySelector("#bannertip").addEventListener("click", function() {
					MSPFA.dialog("Info", document.createTextNode("This image should be 940x90 and will be displayed on the top of the homepage for one week on and after the anniversary of your adventure if the adventure is ongoing and has 100 favorites or more."), ["Okay"]);
				});
				document.querySelector("#jstip").addEventListener("click", function() {
					var msg = document.createElement("span");
					msg.appendChild(document.createTextNode("This box is for JavaScript code. JavaScript is a programming language that can allow MSPFA users to add new functionality to their adventures. With CSS you can change how things look. With JS you can change how things work."));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("For security purposes, any JavaScript code you enter here will have to be manually verified by a moderator. Your code awaits verification automatically, so you do not have to do anything additional for this process to take place."));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("If you want to embed something made with JavaScript on a page, it is not recommended that you use this box. Just use an iframe and program within its file. This way, your code can run safely and does not require verification."));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					var tldr = document.createElement("span");
					tldr.style.fontWeight = "bold";
					tldr.appendChild(document.createTextNode("If you have no idea what JavaScript is or how to use it, ignore this box completely."));
					msg.appendChild(tldr);
					MSPFA.dialog("Info", msg, ["Okay"]);
				});
				if(params.s == "new") {
					editstory.storyauthor.value = MSPFA.me.n;
					editstory.storyauthorsite.value = MSPFA.me.w;
					editstory.storycomments.checked = true;
					grantuser.parentNode.style.display = "";
					savestory.value = "Create";
					savestory.disabled = false;
					savestory.style.display = "";
					story.c = MSPFA.me.i;
					addMirrorer(MSPFA.me.i);
					editstory.storyname.focus();
					editstory.addEventListener("submit", function(evt) {
						evt.preventDefault();
						savestory.disabled = true;
						MSPFA.request(1, {
							do: "story",
							s: "new",
							e: editors.join(","),
							n: editstory.storyname.value,
							r: editstory.storydesc.value,
							h: editstory.storystatus.value,
							t: editstory.storytags.value,
							a: editstory.storyauthor.value,
							w: editstory.storyauthorsite.value,
							o: editstory.storyicon.value,
							q: editstory.storythumb.value,
							x: editstory.storybanner.value,
							b: editstory.storycomments.checked ? 1 : 0,
							y: editstory.storycss.value,
							j: editstory.storyjs.value,
							v: editstory.storyjsverified.checked ? 1 : 0
						}, function(v) {
							unsaved = false;
							location.href = "/my/stories/info/?s=" + v.i;
						}, function() {
							savestory.disabled = false;
						});
					});
					editstory.style.opacity = "";
				} else {
					MSPFA.request(0, {
						do: "story",
						s: params.s
					}, function(v) {
						story = v;
						if(story.l == 2 && !MSPFA.me.p) {
							location.replace("/my/stories/info/?s=new");
						} else if(story.e.indexOf(MSPFA.me.i) != -1 || MSPFA.me.p) {
							var storyname = document.querySelector("#storyname");
							storyname.innerText = story.n;
							if(story.c == MSPFA.me.i || MSPFA.me.p) {
								deletestory.style.display = "";
							}
							editstory.storyname.value = story.n;
							editstory.storydesc.value = story.r;
							editstory.storystatus.value = story.h;
							editstory.storytags.value = story.t;
							editstory.storyauthor.value = story.a;
							editstory.storyauthorsite.value = story.w;
							for(var i = 0; i < story.e.length; i++) {
								addMirrorer(story.e[i]);
							}
							editstory.storyicon.value = story.o;
							dynamicImage(editstory.storyicon, document.querySelector("#storyicon"));
							editstory.storythumb.value = story.q;
							dynamicImage(editstory.storythumb);
							editstory.storybanner.value = story.x;
							dynamicImage(editstory.storybanner);
							editstory.storycomments.checked = story.b;
							editstory.storycss.value = story.y;
							var storyjsverified = document.querySelector("#storyjsverified");
							if(editstory.storyjs.value = story.j) {
								if(story.j == story.v) {
									editstory.storyjsverified.checked = true;
									storyjsverified.appendChild(document.createTextNode(" (verified)"));
								} else {
									storyjsverified.appendChild(document.createTextNode(" (unverified)"));
								}
							}
							if(MSPFA.me.i == "105279526507939039078") {
								editstory.storyjsverified.style.display = "";
							}
							if(!story.l) {
								if(story.p.length) {
									storyname.href = "/?s=" + story.i + "&p=1";
								}
								deletestory.addEventListener("click", function() {
									var msg = document.createElement("span");
									msg.appendChild(document.createTextNode("Are you sure you want to delete this adventure?"));
									msg.appendChild(document.createElement("br"));
									msg.appendChild(document.createTextNode("This can be reverted at any time, as long as you remember the adventure edit link."));
									MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
										if(output == "Yes") {
											MSPFA.request(1, {
												do: "deletestory",
												s: story.i,
												l: 1
											}, function() {
												location.reload();
											});
										}
									});
								});
								var leaveeditors = document.querySelector("#leaveeditors");
								if(story.c == MSPFA.me.i || MSPFA.me.p) {
									grantuser.parentNode.style.display = "";
									leaveeditors.value = "Transfer Ownership";
									leaveeditors.addEventListener("click", function() {
										var msg = document.createElement("span");
										msg.appendChild(document.createTextNode("New owner:"));
										msg.appendChild(document.createElement("br"));
										var owner = document.createElement("input");
										owner.name = "owner";
										owner.type = "text";
										owner.placeholder = "Enter a user ID";
										owner.required = true;
										msg.appendChild(owner);
										MSPFA.dialog("Transfer Ownership", msg, ["Okay", "Cancel"], function(output, form) {
											if(output == "Okay") {
												MSPFA.request(0, {
													do: "user",
													u: form.owner.value
												}, function(user) {
													if(user) {
														if(story.e.indexOf(user.i) != -1) {
															var msg2 = document.createElement("span");
															msg2.appendChild(document.createTextNode("Are you sure you want to give away your ownership of " + story.n + " to "));
															var ownerLink = document.createElement("a");
															ownerLink.href = "/user/?u=" + user.i;
															ownerLink.innerText = user.n;
															msg2.appendChild(ownerLink);
															msg2.appendChild(document.createTextNode("?"));
															msg2.appendChild(document.createElement("br"));
															msg2.appendChild(document.createTextNode("You will remain a mirrorer of this adventure, but your place as owner can only be restored by the new owner."));
															MSPFA.dialog("Confirm", msg2, ["Yes", "No"], function(output2) {
																if(output2 == "Yes") {
																	MSPFA.request(1, {
																		do: "ownership",
																		s: story.i,
																		u: user.i
																	}, function() {
																		location.reload();
																	});
																}
															});
														} else {
															MSPFA.dialog("Error", document.createTextNode("To transfer ownership to another user, they must already be a mirrorer."), ["Okay"]);
														}
													} else {
														MSPFA.dialog("Error", document.createTextNode("User not found."), ["Okay"]);
													}
												});
											}
										});
										owner.focus();
									});
								} else if(story.e.indexOf(MSPFA.me.i) != -1) {
									leaveeditors.addEventListener("click", function() {
										var msg = document.createElement("span");
										msg.appendChild(document.createTextNode("Are you sure you want to leave the group of mirrorers for " + story.n + "?"));
										msg.appendChild(document.createElement("br"));
										msg.appendChild(document.createTextNode("Permission can only be regained from the owner of this adventure."));
										MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
											if(output == "Yes") {
												MSPFA.request(1, {
													do: "leaveeditors",
													s: story.i
												}, function() {
													location.reload();
												});
											}
										});
									});
								} else {
									leaveeditors.style.display = "none";
								}
								editstory.addEventListener("submit", function(evt) {
									evt.preventDefault();
									MSPFA.request(1, {
										do: "story",
										s: story.i,
										e: editors.join(","),
										n: editstory.storyname.value,
										r: editstory.storydesc.value,
										h: editstory.storystatus.value,
										t: editstory.storytags.value,
										a: editstory.storyauthor.value,
										w: editstory.storyauthorsite.value,
										o: editstory.storyicon.value,
										q: editstory.storythumb.value,
										x: editstory.storybanner.value,
										b: editstory.storycomments.checked ? 1 : 0,
										y: editstory.storycss.value,
										j: editstory.storyjs.value,
										v: editstory.storyjsverified.checked ? 1 : 0
									}, function(v) {
										story = v;
										unsaved = false;
										savestory.disabled = true;
										storyname.innerText = editstory.storyname.value;
										editstory.storytags.value = cleanArrayString(editstory.storytags.value);
									});
								});
								savestory.style.display = "";
								editpages.style.display = "";
								userfavs.style.display = "";
							} else {
								var trs = document.querySelectorAll("#editstory > table > tbody > tr");
								for(var i = 2; i < trs.length-1; i++) {
									trs[i].style.display = "none";
								}
								if(story.c == MSPFA.me.i || MSPFA.me.p) {
									if(story.l == 1 || MSPFA.me.p) {
										deletestory.value = "Resurrect";
										deletestory.addEventListener("click", function() {
											MSPFA.request(1, {
												do: "deletestory",
												s: story.i,
												l: 0
											}, function() {
												location.reload();
											});
										});
									}
									if(story.l == 1 && (story.c == MSPFA.me.i || MSPFA.me.p)) {
										var reallydeletestory = document.querySelector("#reallydeletestory");
										reallydeletestory.addEventListener("click", function() {
											var msg = document.createElement("span");
											msg.appendChild(document.createTextNode("Are you sure you want to completely destroy this adventure?"));
											msg.appendChild(document.createElement("br"));
											msg.appendChild(document.createTextNode("This can only be reverted by an administrator."));
											MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
												if(output == "Yes") {
													MSPFA.request(1, {
														do: "deletestory",
														s: story.i,
														l: 2
													}, function() {
														location.reload();
													});
												}
											});
										});
										reallydeletestory.style.display = "";
									}
								} else {
									trs[trs.length-1].querySelector("td").appendChild(document.createTextNode("This adventure has been deleted."));
								}
							}
							editstory.style.opacity = "";
						} else {
							location.replace("/my/stories/");
						}
					}, function() {
						location.replace("/my/stories/info/?s=new");
					}, true);
				}
			} else if(location.pathname == "/my/stories/pages/") {
				var story = {};
				var pages = [];
				var defaultcmd = document.querySelector("#defaultcmd");
				var storypages = document.querySelector("#storypages");
				document.querySelector("#editinfo").addEventListener("click", function() {
					try {
						location.href = "/my/stories/info/?s=" + story.i;
					} catch(err) {}
				});
				var newpage = document.querySelector("#newpage");
				var pageBase = newpage.cloneNode(true);
				var unsaved = [];
				window.onbeforeunload = function() {
					if(unsaved.length || newpage.cmd.value || newpage.body.value || newpage.next.value != (newpage._i+2).toString() || !newpage.usekeys.checked) {
						return true;
					}
				};
				var saveall = document.querySelector("#saveall");
				saveall.addEventListener("click", function() {
					if(!this.disabled) {
						var edits = [];
						for(var i = 0; i < unsaved.length; i++) {
							edits.push({
								p: unsaved[i],
								c: pages[unsaved[i]].cmd.value,
								b: pages[unsaved[i]].body.value,
								n: pages[unsaved[i]].next.value,
								k: !pages[unsaved[i]].usekeys.checked
							});
						}
						MSPFA.request(1, {
							do: "pages",
							s: story.i,
							n: notifyreaders.checked ? 1 : 0,
							e: JSON.stringify(edits)
						}, function() {
							for(var i = 0; i < unsaved.length; i++) {
								pages[unsaved[i]]._new = false;
								pages[unsaved[i]].save.disabled = true;
								pages[unsaved[i]].querySelector("a").href = "/?s=" + story.i + "&p=" + (unsaved[i]+1);
							}
							unsaved = [];
							saveall.disabled = true;
							storyname.href = "/?s=" + story.i + "&p=1";
						});
					}
				});
				var notifyreaders = document.querySelector("#notifyreaders");
				var addUnsaved = function(index) {
					if(unsaved.indexOf(index) == -1) {
						unsaved.push(index);
						if(pages[index].save.disabled) {
							pages[index].save.disabled = false;
						}
						var pagelink = pages[index].querySelector("a");
						if(pagelink.href) {
							pagelink.removeAttribute("href");
						}
						if(saveall.disabled) {
							saveall.disabled = false;
						}
					}
				};
				var movePageDown = function() {
					if(!this.disabled) {
						var other = pages[this.form._i-1];
						var othercmd = other.cmd.value;
						var otherbody = other.body.value;
						var otherusekeys = other.usekeys.value;
						other.cmd.value = this.form.cmd.value;
						other.body.value = this.form.body.value;
						other.usekeys.value = this.form.usekeys.value;
						this.form.cmd.value = othercmd;
						this.form.body.value = otherbody;
						this.form.usekeys.value = otherusekeys;
						addUnsaved(other._i);
						addUnsaved(this.form._i);
					}
				};
				var movePageUp = function() {
					if(!this.disabled) {
						var other = pages[this.form._i+1];
						var othercmd = other.cmd.value;
						var otherbody = other.body.value;
						var otherusekeys = other.usekeys.checked;
						other.cmd.value = this.form.cmd.value;
						other.body.value = this.form.body.value;
						other.usekeys.checked = this.form.usekeys.checked;
						this.form.cmd.value = othercmd;
						this.form.body.value = otherbody;
						this.form.usekeys.checked = otherusekeys;
						addUnsaved(other._i);
						addUnsaved(this.form._i);
					}
				};
				var removePage = function() {
					var t = this;
					if(t.form._new && t.form._i+1 < pages.length) {
						MSPFA.dialog("Error", document.createTextNode("You are only allowed to remove a new page if it is the last one."), ["Okay"]);
					} else if(!t.form._new && unsaved.length) {
						MSPFA.dialog("Error", document.createTextNode("You must save all of your pages before removing any that are not new."), ["Okay"]);
					} else {
						var msg = document.createElement("span");
						msg.appendChild(document.createTextNode("Are you sure you want to remove page " + (t.form._i+1) + "?"));
						if(!t.form._new) {
							msg.appendChild(document.createElement("br"));
							msg.appendChild(document.createTextNode("This will shift all of the page numbers after this page."));
						}
						MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
							if(output == "Yes") {
								if(t.form._new) {
									unsaved.splice(unsaved.indexOf(t.form._i), 1);
									pages.splice(pages.indexOf(t.form), 1);
									t.form.parentNode.removeChild(t.form);
									newpage.querySelector("a").innerText = "Page " + (pages.length+1);
									var nexts = cleanArrayString(newpage.next.value, true);
									for(var i = 0; i < nexts.length; i++) {
										if(nexts[i] > pages.length+2) {
											nexts[i]--;
										}
									}
									newpage.next.value = cleanArrayString(nexts.join(",")).join(",");
									if(pages.length) {
										pages[pages.length-1].moveup.disabled = true;
									}
									if(!unsaved.length) {
										saveall.disabled = true;
									}
								} else {
									MSPFA.request(1, {
										do: "pages",
										s: story.i,
										e: "remove",
										p: t.form._i
									}, function() {
										location.reload();
									});
								}
							}
						});
					}
				};
				var previewPage = function() {
					if(!this.disabled) {
						window.open("/preview/?s=" + story.i + "&p=" + (this.form._i+1) + "&d=" + encodeURIComponent(JSON.stringify({
							p: this.form._i+1,
							c: this.form.cmd.value,
							b: this.form.body.value,
							n: this.form.next.value,
							k: !this.form.usekeys.checked
						})), "_blank");
					}
				};
				var savePage = function() {
					if(!this.disabled) {
						var t = this;
						var edits = [];
						if(t.form._new) {
							for(var i = unsaved.length-1; i >= 0; i--) {
								if(unsaved[i] <= t.form._i && pages[unsaved[i]]._new) {
									edits.push({
										p: unsaved[i],
										c: pages[unsaved[i]].cmd.value,
										b: pages[unsaved[i]].body.value,
										n: pages[unsaved[i]].next.value,
										k: !t.form.usekeys.checked
									});
								}
							}
						} else {
							edits.push({
								p: t.form._i,
								c: t.form.cmd.value,
								b: t.form.body.value,
								n: t.form.next.value,
								k: !t.form.usekeys.checked
							});
						}
						MSPFA.request(1, {
							do: "pages",
							s: story.i,
							n: notifyreaders.checked ? 1 : 0,
							e: JSON.stringify(edits)
						}, function() {
							if(t.form._new) {
								for(var i = unsaved.length-1; i >= 0; i--) {
									if(unsaved[i] <= t.form._i && pages[unsaved[i]]._new) {
										pages[unsaved[i]]._new = false;
										pages[unsaved[i]].save.disabled = true;
										pages[unsaved[i]].querySelector("a").href = "/?s=" + story.i + "&p=" + (unsaved[i]+1);
										unsaved.splice(i, 1);
									}
								}
							} else {
								t.form.save.disabled = true;
								t.form.querySelector("a").href = "/?s=" + story.i + "&p=" + (t.form._i+1);
								unsaved.splice(unsaved.indexOf(t.form._i), 1);
							}
							if(!unsaved.length) {
								saveall.disabled = true;
							}
							storyname.href = "/?s=" + story.i + "&p=1";
						});
					}
				};
				var changeValue = function() {
					addUnsaved(this.form._i);
					if(this.form.save.disabled) {
						this.form.save.disabled = false;
					}
				};
				bbtoolbar.querySelector("input[data-tag=\"user\"]").style.display = "none";
				bbe = newpage.body;
				bbe.parentNode.insertBefore(bbtoolbar, bbe);
				bbtoolbar.style.display = "";
				var boxFocus = function() {
					bbe = this;
					bbe.parentNode.insertBefore(bbtoolbar, bbe);
				};
				var bbtools = bbtoolbar.querySelectorAll("input");
				for(var i = 0; i < bbtools.length; i++) {
					bbtools[i].addEventListener("click", function() {
						if(this.form != newpage) {
							addUnsaved(this.form._i);
						}
					});
				}
				var commonColors = function(tag) {
					var alltext = "";
					for(var i = 0; i < pages.length; i++) {
						alltext += pages[i].cmd.value + "\n" + pages[i].body.value + "\n";
					}
					var bcolors = {};
					var findColors = new RegExp("\\[" + tag + "=(.*?)\\]", "gi");
					var findColorsMatch;
					while(findColorsMatch = findColors.exec(alltext)) {
						var hex = findColorsMatch[1].toLowerCase().replace(/("?)#?([a-f0-9]{3}(?:[a-f0-9]{3})?)\1/gi, "#$2");
						if(!bcolors[hex]) {
							bcolors[hex] = 0;
						}
						bcolors[hex]++;
					}
					var colors = [];
					for(var i in bcolors) {
						colors.push([i, bcolors[i]]);
					}
					colors.sort(function(a, b) {
						return b[1]-a[1];
					});
					if(colors.length) {
						var divs = box.querySelectorAll("div");
						var div = divs[1].lastChild;
						div.appendChild(document.createElement("br"));
						div.appendChild(document.createElement("br"));
						div.appendChild(document.createTextNode("Commonly-used colors:"));
						div.appendChild(document.createElement("br"));
						for(var i = 0; i < colors.length; i++) {
							var cb = document.createElement("input");
							cb.setAttribute("type", "button");
							cb.title = colors[i][0];
							cb.style.width = cb.style.height = "24px";
							cb.style.border = "1px solid #a2a2a2";
							cb.style.backgroundColor = colors[i][0];
							cb.addEventListener("click", function() {
								box.color.value = box.code.value = this.title;
							});
							cb.addEventListener("dblclick", function() {
								divs[2].firstChild.click();
							});
							div.appendChild(cb);
						}
					}
				};
				bbtoolbar.querySelector("input[data-tag=\"color\"]").addEventListener("click", function() {
					commonColors("color");
				});
				bbtoolbar.querySelector("input[data-tag=\"background\"]").addEventListener("click", function() {
					commonColors("background");
				});
				document.querySelector("#replaceall").addEventListener("click", function() {
					var msg = document.createElement("span");
					msg.appendChild(document.createTextNode("This tool will find and replace the text in all of your commands and bodies. Replacements cannot be reverted after being saved, so be careful while using this tool."));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("Find: "));
					var findt = document.createElement("input");
					findt.name = "findt";
					findt.setAttribute("type", "text");
					findt.required = true;
					msg.appendChild(findt);
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("Replace: "));
					var replacet = document.createElement("input");
					replacet.name = "replacet";
					replacet.setAttribute("type", "text");
					msg.appendChild(replacet);
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createElement("br"));
					msg.appendChild(document.createTextNode("Match case: "));
					var matchcase = document.createElement("input");
					matchcase.name = "matchcase";
					matchcase.setAttribute("type", "checkbox");
					msg.appendChild(matchcase);
					MSPFA.dialog("Find and Replace", msg, ["Replace All", "Cancel"], function(output, form) {
						if(output == "Replace All") {
							var findtt = new RegExp(form.findt.value.replace(/(?=[.\\+*?[^\]$(){}=!<>|:\/-])/g, "\\"), form.matchcase.checked ? "g" : "gi");
							var replacett = form.replacet.value;
							for(var i = 0; i < pages.length; i++) {
								var cmdreplace = pages[i].cmd.value.replace(findtt, replacett);
								var bodyreplace = pages[i].body.value.replace(findtt, replacett);
								if(pages[i].cmd.value != cmdreplace || pages[i].body.value != bodyreplace) {
									pages[i].cmd.value = cmdreplace;
									pages[i].body.value = bodyreplace;
									addUnsaved(i);
								}
							}
						}
					});
					findt.focus();
				});
				var addPage = function(index) {
					var page = pageBase.cloneNode(true);
					page.id = "p" + (index+1);
					page._i = index;
					page.querySelector("a").innerText = "Page " + (index+1);
					page.moveup.addEventListener("click", movePageUp);
					page.movedown.addEventListener("click", movePageDown);
					page.remove.addEventListener("click", removePage);
					page.save.addEventListener("click", savePage);
					page.preview.addEventListener("click", previewPage);
					page.cmd.addEventListener("change", changeValue);
					page.body.addEventListener("change", changeValue);
					page.next.addEventListener("change", changeValue);
					page.cmd.addEventListener("keydown", changeValue);
					page.body.addEventListener("keydown", changeValue);
					page.next.addEventListener("keydown", changeValue);
					page.body.addEventListener("focus", boxFocus);
					page.usekeys.addEventListener("change", changeValue);
					pages.push(page);
					newpage.parentNode.insertBefore(page, newpage.nextSibling);
					return page;
				};
				MSPFA.request(0, {
					do: "story",
					s: params.s
				}, function(v) {
					story = v;
					if(story.l) {
						location.replace("/my/stories/info/?s=" + story.i);
					} else if(story.e.indexOf(MSPFA.me.i) != -1 || MSPFA.me.p) {
						var storyname = document.querySelector("#storyname");
						if(story.p.length) {
							storyname.href = "/?s=" + story.i + "&p=1";
						}
						storyname.innerText = story.n;
						defaultcmd.value = story.m || "Next.";
						pageBase.cmd.placeholder = defaultcmd.value;
						var cmds = document.querySelectorAll("input[name=\"cmd\"]");
						for(var i = 0; i < cmds.length; i++) {
							cmds[i].placeholder = defaultcmd.value;
						}
						defaultcmd.addEventListener("change", function() {
							defaultcmd.value = defaultcmd.value || "Next.";
							MSPFA.request(1, {
								do: "pages",
								s: story.i,
								e: JSON.stringify({
									m: this.value
								})
							}, function() {
								pageBase.cmd.placeholder = defaultcmd.value;
								var cmds = document.querySelectorAll("input[name=\"cmd\"]");
								for(var i = 0; i < cmds.length; i++) {
									cmds[i].placeholder = defaultcmd.value;
								}
							});
						});
						newpage.querySelector("a").innerText = "Page " + (story.p.length+1);
						newpage.movedown.disabled = true;
						newpage.moveup.disabled = true;
						newpage.remove.style.display = "none";
						newpage.save.value = "Add";
						newpage.save.disabled = false;
						newpage.next.value = story.p.length+2;
						newpage.usekeys.checked = true;
						newpage.body.addEventListener("focus", boxFocus);
						newpage.preview.addEventListener("click", previewPage);
						newpage._i = story.p.length;
						newpage.save.addEventListener("click", function() {
							if(pages.length) {
								pages[pages.length-1].moveup.disabled = false;
							}
							var page = addPage(pages.length);
							page._new = true;
							newpage._i = page._i+1;
							if(page._i == 0) {
								page.movedown.disabled = true;
							}
							page.moveup.disabled = true;
							page.save.disabled = false;
							addUnsaved(page._i);
							page.cmd.value = newpage.cmd.value || defaultcmd.value;
							page.body.value = newpage.body.value;
							page.next.value = newpage.next.value;
							page.usekeys.checked = newpage.usekeys.checked;
							newpage.cmd.value = "";
							newpage.body.value = "";
							newpage.next.value = pages.length+2;
							newpage.usekeys.checked = true;
							newpage.querySelector("a").innerText = "Page " + (pages.length+1);
							newpage.cmd.focus();
						});
						for(var i = 0; i < story.p.length; i++) {
							var page = addPage(i);
							if(page._i == 0) {
								page.movedown.disabled = true;
							}
							if(page._i == story.p.length-1) {
								page.moveup.disabled = true;
							}
							page.querySelector("a").href = "/?s=" + story.i + "&p=" + (page._i+1);
							page.cmd.value = story.p[i].c;
							page.body.value = story.p[i].b;
							page.next.value = story.p[i].n.join(",");
							if(!story.p[i].k) {
								page.usekeys.checked = true;
							}
						}
						var showscale = 10;
						var showoffset = pages.length;
						var shown = showscale;
						var showless = document.querySelector("#showless");
						var showmore = document.querySelector("#showmore");
						var showall = document.querySelector("#showall");
						if(pages.length > showscale) {
							showmore.disabled = false;
							showall.disabled = false;
							for(var i = 0; i < showoffset-shown; i++) {
								pages[i].style.display = "none";
							}
							showless.addEventListener("click", function() {
								shown -= showscale;
								var index = Math.max(0, showoffset-shown);
								for(var i = Math.max(0, index-showscale); i < index; i++) {
									pages[i].style.display = "none";
								}
								showmore.disabled = false;
								showall.disabled = false;
								if(shown <= showscale) {
									showless.disabled = true;
								}
							});
							showmore.addEventListener("click", function() {
								shown += showscale;
								var index = Math.max(0, showoffset-shown);
								for(var i = index; i < index+showscale; i++) {
									pages[i].style.display = "";
								}
								showless.disabled = false;
								if(shown >= showoffset) {
									showmore.disabled = true;
									showall.disabled = true;
								}
							});
							showall.addEventListener("click", function() {
								shown = Math.ceil(showoffset/showscale)*showscale;
								for(var i = 0; i < showoffset; i++) {
									pages[i].style.display = "";
								}
								showless.disabled = false;
								showmore.disabled = true;
								showall.disabled = true;
							});
						}
						var jumptopage = document.querySelector("#jumptopage");
						var doJumpToPage = function() {
							var val = parseInt(jumptopage.value);
							if(!isNaN(val)) {
								for(var i = pages.length-10; i >= val; i -= showscale) {
									showmore.click();
								}
								setTimeout(function() {
									location.hash = "#p" + val;
								});
							}
						};
						jumptopage.addEventListener("change", doJumpToPage);
						document.querySelector("#editpages").style.opacity = "";
						if(location.hash.indexOf("#p") == 0 && location.hash.length > 2) {
							var val = parseInt(location.hash.slice(2));
							if(!isNaN(val)) {
								location.hash = "";
								jumptopage.value = val;
								doJumpToPage();
							}
						}
					} else {
						location.replace("/my/stories/");
					}
				}, function() {
					location.replace("/my/stories/");
				}, true);
			} else if(location.pathname == "/my/settings/") {
				document.querySelector("#" + (MSPFA.me.v ? "email1" : "email2")).style.display = "";
				var editsettings = document.querySelector("#editsettings");
				var savesettings = document.querySelector("#savesettings");
				var unsaved = false;
				window.onbeforeunload = function() {
					if(unsaved) {
						return true;
					}
				};
				var setUnsaved = function() {
					unsaved = true;
					if(savesettings.disabled) {
						savesettings.disabled = false;
					}
				};
				var keyName = {
					"3": "Cancel",
					"8": "Backspace",
					"9": "Tab",
					"13": "Enter",
					"16": "Shift",
					"17": "Control",
					"18": "Alt",
					"19": "Pause",
					"20": "Caps Lock",
					"27": "Escape",
					"32": "Space",
					"33": "Page Up",
					"34": "Page Down",
					"36": "Home",
					"37": "Arrow Left",
					"38": "Arrow Up",
					"39": "Arrow Right",
					"40": "Arrow Down",
					"45": "Insert",
					"46": "Delete",
					"48": "0",
					"49": "1",
					"50": "2",
					"51": "3",
					"52": "4",
					"53": "5",
					"54": "6",
					"55": "7",
					"56": "8",
					"57": "9",
					"65": "A",
					"66": "B",
					"67": "C",
					"68": "D",
					"69": "E",
					"70": "F",
					"71": "G",
					"72": "H",
					"73": "I",
					"74": "J",
					"75": "K",
					"76": "L",
					"77": "M",
					"78": "N",
					"79": "O",
					"80": "P",
					"81": "Q",
					"82": "R",
					"83": "S",
					"84": "T",
					"85": "U",
					"86": "V",
					"87": "W",
					"88": "X",
					"89": "Y",
					"90": "Z",
					"91": "Meta",
					"93": "Context Menu",
					"96": "Numpad 0",
					"97": "Numpad 1",
					"98": "Numpad 2",
					"99": "Numpad 3",
					"100": "Numpad 4",
					"101": "Numpad 5",
					"102": "Numpad 6",
					"103": "Numpad 7",
					"104": "Numpad 8",
					"105": "Numpad 9",
					"106": "*",
					"107": "+",
					"109": "-",
					"110": ".",
					"111": "/",
					"112": "F1",
					"113": "F2",
					"114": "F3",
					"115": "F4",
					"116": "F5",
					"117": "F6",
					"118": "F7",
					"119": "F8",
					"120": "F9",
					"121": "F10",
					"122": "F11",
					"123": "F12",
					"144": "Num Lock",
					"145": "Scroll Lock",
					"166": "Browser Back",
					"167": "Browser Forward",
					"173": "Audio Volume Mute",
					"174": "Audio Volume Down",
					"175": "Audio Volume Up",
					"176": "Media Track Next",
					"177": "Media Track Previous",
					"179": "Media Track Pause",
					"183": "Launch Application 2",
					"186": ";",
					"187": "=",
					"188": ",",
					"189": "-",
					"190": ".",
					"191": "/",
					"192": "`",
					"219": "[",
					"220": "\\",
					"221": "]",
					"222": "'"
				};
				var current = null;
				var clickCtrl = function() {
					if(current) {
						current.style.backgroundColor = "";
						if(current == this) {
							current = null;
							return;
						}
					}
					this.style.backgroundColor = "#a5cee6";
					current = this;
				};
				window.addEventListener("keydown", function(evt) {
					if(current) {
						evt.preventDefault();
						var name = current.name.split("_");
						MSPFA.me.s.k[name[1]] = evt.keyCode;
						var n = keyName[evt.keyCode];
						if(!n) {
							console.log(evt);
							n = "Key #" + evt.keyCode;
						}
						current.value = n;
						current.style.backgroundColor = "";
						current = null;
						setUnsaved();
					}
				});
				var sbin = MSPFA.me.s.s.toString(2).split("").reverse().join("");
				var changeNotifs = function() {
					sbin = sbin.split("");
					for(var i = 0; i < this._i; i++) {
						if(!sbin[i]) {
							sbin[i] = "0";
						}
					}
					sbin[this._i] = this.checked ? "1" : "0";
					sbin = sbin.reverse();
					MSPFA.me.s.s = parseInt(sbin.join(""), 2);
					sbin = sbin.reverse().join("");
					setUnsaved();
				};
				var changeTheme = function() {
					MSPFA.me.s.t = parseInt(this.value);
					theme.href = "/css/theme" + MSPFA.me.s.t + ".css";
					setUnsaved();
				};
				var changePrivacy = function() {
					MSPFA.me.s.p = this.checked ? 1 : 0;
					setUnsaved();
				};
				var sindex = 0;
				for(var i = 0; i < editsettings.elements.length; i++) {
					if(editsettings.elements[i].name) {
						var e = editsettings.elements[i];
						var name = e.name.split("_");
						if(name[0] == "k") {
							e.value = keyName[MSPFA.me.s.k[name[1]]] || "Key #" + MSPFA.me.s.k[name[1]];
							e.addEventListener("click", clickCtrl);
						} else if(name[0] == "s") {
							e._i = sindex;
							if(parseInt(sbin[e._i])) {
								e.checked = true;
							}
							sindex++;
							e.addEventListener("change", changeNotifs);
						} else if(name[0] == "t") {
							if(e.value.toString() == MSPFA.me.s.t.toString()) {
								e.checked = true;
							}
							e.addEventListener("change", changeTheme);
						} else if(name[0] == "f") {
							if(MSPFA.me.s.p) {
								e.checked = true;
							}
							e.addEventListener("change", changePrivacy);
						} else {
							e.addEventListener("keydown", setUnsaved);
							e.addEventListener("change", setUnsaved);
						}
					}
				}
				editsettings.addEventListener("submit", function(evt) {
					evt.preventDefault();
					MSPFA.request(1, {
						do: "settings",
						s: JSON.stringify(MSPFA.me.s)
					}, function() {
						unsaved = false;
						savesettings.disabled = true;
					});
				});
				editsettings.style.opacity = "";
			} else if(location.pathname == "/my/messages/new/") {
				var unsaved = true;
				window.onbeforeunload = function() {
					if(unsaved) {
						return true;
					}
				};
				var newmessage = document.querySelector("#newmessage");
				bbtoolbar.querySelector("input[data-tag=\"user\"]").style.display = "none";
				bbe = newmessage.body;
				bbe.parentNode.insertBefore(bbtoolbar, bbe);
				bbtoolbar.style.display = "";
				var recipients = document.querySelector("#recipients");
				var addrecipient = document.querySelector("#addrecipient");
				var addrecipientbtn = document.querySelector("#addrecipientbtn");
				var bccs = document.querySelector("#bccs");
				var addbcc = document.querySelector("#addbcc");
				var addbccbtn = document.querySelector("#addbccbtn");
				var to = [];
				var bcc = [];
				var removeRecipient = function() {
					to.splice(to.indexOf(this.parentNode.firstChild._u), 1);
					this.parentNode.parentNode.removeChild(this.parentNode);
				};
				var addRecipient = function(id) {
					var loadUser = function(user) {
						if(user) {
							if(to.indexOf(user.i) == -1 && bcc.indexOf(user.i) == -1) {
								to.push(user.i);
								var span = document.createElement("span");
								var a = document.createElement("a");
								a._u = user.i;
								a.href = "/user/?u=" + user.i;
								a.innerText = user.n;
								span.appendChild(a);
								span.appendChild(document.createTextNode(" "));
								var x = document.createElement("input");
								x.classList.add("major");
								x.setAttribute("type", "button");
								x.value = "x";
								x.style.padding = "0";
								x.addEventListener("click", removeRecipient);
								span.appendChild(x);
								span.appendChild(document.createElement("br"));
								if(user.i == MSPFA.me.i) {
									recipients.insertBefore(span, recipients.firstChild);
								} else {
									recipients.insertBefore(span, addrecipient);
								}
							} else {
								MSPFA.dialog("Error", document.createTextNode("That user has already been added as a recipient."), ["Okay"]);
							}
						} else {
							MSPFA.dialog("Error", document.createTextNode("User not found."), ["Okay"]);
						}
					};
					if(id == MSPFA.me.i) {
						loadUser(MSPFA.me);
					} else {
						MSPFA.request(0, {
							do: "user",
							u: id
						}, loadUser);
					}
				};
				addrecipientbtn.addEventListener("click", function() {
					if(!addrecipient.value) {
						addrecipient.focus();
					} else {
						addRecipient(addrecipient.value);
						addrecipient.value = "";
						addrecipient.focus();
					}
				});
				addRecipient(MSPFA.me.i);
				var removeBCC = function() {
					bcc.splice(bcc.indexOf(this.parentNode.firstChild._u), 1);
					this.parentNode.parentNode.removeChild(this.parentNode);
				};
				var addBCC = function(id) {
					MSPFA.request(0, {
						do: "user",
						u: id
					}, function(user) {
						if(user) {
							if(to.indexOf(user.i) == -1 && bcc.indexOf(user.i) == -1) {
								bcc.push(user.i);
								var span = document.createElement("span");
								var a = document.createElement("a");
								a._u = user.i;
								a.href = "/user/?u=" + user.i;
								a.innerText = user.n;
								span.appendChild(a);
								span.appendChild(document.createTextNode(" "));
								var x = document.createElement("input");
								x.classList.add("major");
								x.setAttribute("type", "button");
								x.value = "x";
								x.style.padding = "0";
								x.addEventListener("click", removeBCC);
								span.appendChild(x);
								span.appendChild(document.createElement("br"));
								if(user.i == MSPFA.me.i) {
									bccs.insertBefore(span, bccs.firstChild);
								} else {
									bccs.insertBefore(span, addbcc);
								}
							} else {
								MSPFA.dialog("Error", document.createTextNode("That user has already been added as a recipient."), ["Okay"]);
							}
						} else {
							MSPFA.dialog("Error", document.createTextNode("User not found."), ["Okay"]);
						}
					});
				};
				addbccbtn.addEventListener("click", function() {
					if(!addbcc.value) {
						addbcc.focus();
					} else {
						addBCC(addbcc.value);
						addbcc.value = "";
						addbcc.focus();
					}
				});
				var mdat = {};
				if(sessionStorage.m) {
					try {
						mdat = JSON.parse(sessionStorage.m);
					} catch(err) {
						var msg = document.createElement("span");
						msg.appendChild(document.createTextNode("This error can literally not occur unless you are actually trying to break the website."));
						msg.appendChild(document.createElement("br"));
						msg.appendChild(document.createTextNode("Please stop trying to break the website."));
						MSPFA.dialog("Error", msg, ["Okay"]);
					}
					delete sessionStorage.m;
				}
				if(mdat.s) {
					newmessage.subject.value = mdat.s;
				}
				if(mdat.b) {
					newmessage.body.value = mdat.b;
				}
				newmessage.body.focus();
				newmessage.body.selectionStart = newmessage.body.selectionEnd = 0;
				newmessage.body.scrollTop = 0;
				if(mdat.t) {
					var pto = mdat.t.split(",");
					for(var i = 0; i < pto.length; i++) {
						if(pto[i] != MSPFA.me.i) {
							addRecipient(pto[i]);
						}
					}
				}
				var sendmsg = document.querySelector("#sendmsg");
				newmessage.addEventListener("submit", function(evt) {
					evt.preventDefault();
					if(to.length || bcc.length) {
						sendmsg.disabled = true;
						MSPFA.request(1, {
							do: "sendmsg",
							t: to.join(","),
							c: bcc.join(","),
							s: newmessage.subject.value,
							b: newmessage.body.value
						}, function(m) {
							unsaved = false;
							location.href = "/my/messages/view/?m=" + m;
						}, function() {
							sendmsg.disabled = false;
						});
					} else {
						MSPFA.dialog("Error", document.createTextNode("Your message must have at least one recipient."), ["Okay"]);
					}
				});
				newmessage.style.opacity = "";
			} else if(location.pathname == "/my/messages/view/") {
				MSPFA.request(1, {
					do: "readmsg",
					m: params.m
				}, function(m) {
					if(typeof m == "object") {
						loadNotifications();
						document.querySelector("#allmsgs").addEventListener("click", function() {
							location.href = "/my/messages/";
						});
						document.querySelector("#deletemsg").addEventListener("click", function() {
							var msg = document.createElement("span");
							msg.appendChild(document.createTextNode("Are you sure you want to delete this message?"));
							msg.appendChild(document.createElement("br"));
							msg.appendChild(document.createTextNode("This cannot be reverted."));
							MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
								if(output == "Yes") {
									MSPFA.request(1, {
										do: "deletemsg",
										m: params.m
									}, function() {
										location.href = "/my/messages/";
									});
								}
							});
						});
						var editmsg = document.querySelector("#editmsg");
						if(m.f.i == MSPFA.me.i) {
							editmsg.style.display = "";
							editmsg.addEventListener("click", function() {
								var msg = document.createElement("span");
								msg.appendChild(document.createTextNode("Edit message:"));
								msg.appendChild(document.createElement("br"));
								var old = document.createElement("textarea");
								old.rows = 16;
								old.value = m.b;
								old.style.width = "830px";
								msg.appendChild(old);
								MSPFA.dialog("Message", msg, ["Save", "Cancel"], function(output) {
									if(output == "Save") {
										MSPFA.request(1, {
											do: "editmsg",
											m: m.i,
											b: old.value
										}, function(v) {
											message.removeChild(message.firstChild);
											m.b = v;
											message.appendChild(MSPFA.parseBBCode(m.b));
										});
									}
								});
								old.focus();
								old.selectionStart = old.selectionEnd = 0;
								old.scrollTop = 0;
							});
						}
						document.querySelector("#replymsg").addEventListener("click", function() {
							sessionStorage.m = JSON.stringify({
								t: m.f.i,
								s: m.s,
								b: "\n\n[spoiler open=\"Show Previous Message\" close=\"Hide Previous Message\"]\n" + m.b + "\n[/spoiler]"
							});
							location.href = "/my/messages/new/";
						});
						document.querySelector("#subject").innerText = m.s;
						var from = document.querySelector("#from");
						from.href = "/user/?u=" + m.f.i;
						from.innerText = m.f.n;
						var to = document.querySelector("#to");
						var mtl = 0;
						for(var i = 0; i < m.t.length; i++) {
							if(m.t[i].i != m.f.i) {
								mtl++;
								if(to.lastChild) {
									to.appendChild(document.createTextNode(", "));
								}
								var ulink = document.createElement("a");
								ulink.href = "/user/?u=" + m.t[i].i;
								ulink.innerText = m.t[i].n;
								to.appendChild(ulink);
							}
						}
						if(!mtl) {
							to.innerText = "N/A";
						}
						var bcc = document.querySelector("#bcc");
						var mcl = 0;
						for(var i = 0; i < m.c.length; i++) {
							if(m.c[i].i != m.f.i) {
								mcl++;
								if(bcc.lastChild) {
									bcc.appendChild(document.createTextNode(", "));
								}
								var ulink = document.createElement("a");
								ulink.href = "/user/?u=" + m.c[i].i;
								ulink.innerText = m.c[i].n;
								bcc.appendChild(ulink);
							}
						}
						if(!mcl) {
							bcc.innerText = "N/A";
						}
						if(MSPFA.me.p) {
							var readby = document.querySelector("#readby");
							var mrl = 0;
							for(var i = 0; i < m.r.length; i++) {
								mrl++;
								if(readby.lastChild) {
									readby.appendChild(document.createTextNode(", "));
								}
								var ulink = document.createElement("a");
								ulink.href = "/user/?u=" + m.r[i].i;
								ulink.innerText = m.r[i].n;
								readby.appendChild(ulink);
							}
							if(!mrl) {
								readby.innerText = "N/A";
							}
							var deletedby = document.querySelector("#deletedby");
							var mdl = 0;
							for(var i = 0; i < m.l.length; i++) {
								mdl++;
								if(deletedby.lastChild) {
									deletedby.appendChild(document.createTextNode(", "));
								}
								var ulink = document.createElement("a");
								ulink.href = "/user/?u=" + m.l[i].i;
								ulink.innerText = m.l[i].n;
								deletedby.appendChild(ulink);
							}
							if(!mdl) {
								deletedby.innerText = "N/A";
							}
							readby.parentNode.style.display = "";
						}
						var message = document.querySelector("#message");
						message.appendChild(MSPFA.parseBBCode(m.b));
						message.parentNode.parentNode.parentNode.style.opacity = "";
					} else {
						location.replace("/my/messages/");
					}
				});
			} else if(location.pathname == "/my/messages/") {
				document.querySelector("#newmessage").href = "/my/messages/new/";
				MSPFA.request(1, {
					do: "allmsgs"
				}, function(m) {
					var msgs = document.querySelector("#messages");
					var selectall = document.querySelector("#selectall");
					var markasread = document.querySelector("#markasread");
					var markasunread = document.querySelector("#markasunread");
					var deletemsgs = document.querySelector("#deletemsgs");
					var noNewMessages = function() {
						var tr = document.createElement("tr");
						var td = document.createElement("td");
						td.appendChild(document.createTextNode("No new messages were found."));
						tr.appendChild(td);
						msgs.appendChild(tr);
						msgs.parentNode.parentNode.parentNode.style.display = "";
					};
					if(m.s.length) {
						var sel = [];
						var updateSelected = function() {
							sel = [];
							var checked = msgs.querySelectorAll("input:checked");
							for(var i = 0; i < checked.length; i++) {
								sel.push(parseInt(checked[i].parentNode.parentNode.id.slice(1)));
							}
							if(sel.length) {
								markasread.disabled = false;
								markasunread.disabled = false;
								deletemsgs.disabled = false;
							} else {
								markasread.disabled = true;
								markasunread.disabled = true;
								deletemsgs.disabled = true;
							}
						};
						m.s.sort(function(a, b) {
							return b.d-a.d;
						});
						for(var i = 0; i < m.s.length; i++) {
							(function(msi) {
								var tr = document.createElement("tr");
								tr.id = "m" + msi.i;
								var td0 = document.createElement("td");
								var check = document.createElement("input");
								check.setAttribute("type", "checkbox");
								check.addEventListener("change", updateSelected);
								td0.appendChild(check);
								tr.appendChild(td0);
								var td1 = document.createElement("td");
								td1.style.verticalAlign = "top";
								var img = new Image();
								img.classList.add("cellicon");
								img.src = m.u[msi.f].o || "/images/wat/random.njs?cb=" + msi.i;
								td1.appendChild(img);
								tr.appendChild(td1);
								var td2 = document.createElement("td");
								td2.style.width = "100%";
								var t = document.createElement("a");
								t.classList.add("major");
								t.href = "/my/messages/view/?m=" + msi.i;
								t.innerText = msi.s;
								td2.appendChild(t);
								td2.appendChild(document.createElement("br"));
								td2.appendChild(document.createTextNode(m.u[msi.f].n + " - " + fetchDate(new Date(msi.d), true)));
								td2.appendChild(document.createElement("br"));
								var mb = msi.b;
								var prevmb;
								while(mb != prevmb) {
									prevmb = mb;
									mb = mb.replace(/<(.*?)(?:(?: |\n)(?:.|\n)*?)?>((?:.|\n)*?)<\/\1>/g, "$2");
								}
								var mbs = MSPFA.parseBBCode("[spoiler open=\"Show Message Preview\" close=\"Hide Message Preview\"][/spoiler]");
								mbs.querySelector(".spoiler > div:nth-child(2)").appendChild(MSPFA.parseBBCode(mb, true));
								mbs.querySelector(".spoiler > div:first-child > input").addEventListener("click", function() {
									if(this.parentNode.parentNode.classList.contains("open")) {
										MSPFA.request(1, {
											do: "readmsg",
											m: msi.i.toString()
										}, function() {
											td0.style.borderLeft = "8px solid #dddddd";
										});
									}
								});
								td2.appendChild(mbs);
								tr.appendChild(td2);
								td0.style.borderLeft = "8px solid #dddddd";
								if(!msi.r) {
									td0.style.borderLeft = "8px solid #5caedf";
								}
								msgs.appendChild(tr);
							})(m.s[i]);
						}
						var setDisabled = function(disabled) {
							var ins = msgs.querySelectorAll("input[type=\"checkbox\"]");
							for(var i = 0; i < ins.length; i++) {
								ins[i].disabled = disabled;
							}
							selectall.disabled = disabled;
							markasread.disabled = disabled;
							markasunread.disabled = disabled;
							deletemsgs.disabled = disabled;
						};
						var sall = 0;
						selectall.addEventListener("click", function() {
							if(!this.disabled) {
								var checks = msgs.querySelectorAll("input");
								sall = (sall+1)%2;
								for(var i = 0; i < checks.length; i++) {
									checks[i].checked = sall;
								}
								this.value = sall ? "Deselect All" : "Select All";
								updateSelected();
							}
						});
						markasread.addEventListener("click", function() {
							var t = this;
							if(!t.disabled) {
								setDisabled(true);
								MSPFA.request(1, {
									do: "readmsg",
									m: sel.join(",")
								}, function() {
									for(var i = 0; i < sel.length; i++) {
										document.querySelector("#m" + sel[i]).firstChild.style.borderLeft = "8px solid #dddddd";
									}
									setDisabled(false);
								});
							}
						});
						deletemsgs.addEventListener("click", function() {
							var t = this;
							if(!t.disabled) {
								var msg = document.createElement("span");
								msg.appendChild(document.createTextNode("Are you sure you want to delete the selected messages?"));
								msg.appendChild(document.createElement("br"));
								msg.appendChild(document.createTextNode("This cannot be reverted."));
								MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
									if(output == "Yes") {
										setDisabled(true);
										MSPFA.request(1, {
											do: "deletemsg",
											m: sel.join(",")
										}, function() {
											for(var i = 0; i < sel.length; i++) {
												var tr = document.querySelector("#m" + sel[i]);
												tr.parentNode.removeChild(tr);
											}
											setDisabled(false);
											updateSelected();
											if(!msgs.children.length) {
												noNewMessages();
											}
										}, function() {
											setDisabled(false);
										});
									}
								});
							}
						});
						markasunread.addEventListener("click", function() {
							var t = this;
							if(!t.disabled) {
								setDisabled(true);
								MSPFA.request(1, {
									do: "unreadmsg",
									m: sel.join(",")
								}, function() {
									for(var i = 0; i < sel.length; i++) {
										document.querySelector("#m" + sel[i]).firstChild.style.borderLeft = "8px solid #5caedf";
									}
									setDisabled(false);
								});
							}
						});
						msgs.parentNode.parentNode.parentNode.style.display = "";
					} else {
						noNewMessages();
					}
				});
			} else if(location.pathname == "/achievements/") {
				MSPFA.slide[1] = function() {
					var al = document.querySelector("#alist");
					var ans = al.querySelectorAll(".major");
					if(MSPFA.me.p) {
						var achieveToggle = function(evt) {
							evt.preventDefault();
							var t = this;
							MSPFA.request(1, {
								do: "achieve",
								u: al._u.i,
								a: t._i
							}, function(v) {
								if(v) {
									t.parentNode.parentNode.classList.remove("unlit");
									t.parentNode.parentNode.classList.add("lit");
								} else {
									t.parentNode.parentNode.classList.remove("lit");
									t.parentNode.parentNode.classList.add("unlit");
								}
							});
						};
						for(var i = 0; i < ans.length; i++) {
							ans[i].style.cursor = "pointer";
							ans[i].addEventListener("click", achieveToggle);
						}
					}
				};
				if(MSPFA.slide[0]) {
					MSPFA.slide[1]();
				}
			} else if(location.pathname == "/feature/") {
				MSPFA.slide[1] = function() {
					var vote = document.querySelector("#vote");
					var uvote = vote._f.u[MSPFA.me.i];
					if(uvote) {
						vote.storyid.value = uvote+1;
					}
					if(MSPFA.me.p) {
						var stories = document.querySelector("#stories");
						while(stories.lastChild) {
							stories.removeChild(stories.lastChild);
						}
						vote._f.s = vote._f.s.sort(function(a, b) {
							return b.k-a.k;
						});
						var stories = document.querySelector("#stories");
						if(vote._f.s.length) {
							for(var i = 0; i < vote._f.s.length; i++) {
								var storyCell = getStoryCell(vote._f.s[i]);
								var votes = document.createElement("td");
								votes.classList.add("cellrank");
								votes.innerText = vote._f.s[i].k;
								storyCell.insertBefore(votes, storyCell.firstChild);
								stories.appendChild(storyCell);
							}
						} else {
							var tr = document.createElement("tr");
							var td = document.createElement("td");
							td.appendChild(document.createTextNode("No adventures were found."));
							tr.appendChild(td);
							stories.appendChild(tr);
						}
					}
				};
				if(vote._f) {
					MSPFA.slide[1]();
				}
			} else if(location.pathname == "/favs/") {
				if(params.u == MSPFA.me.i || MSPFA.me.p) {
					if(!MSPFA.slide[0]) {
						MSPFA.slide[1] = true;
					} else if(MSPFA.slide[1]) {
						var stories = document.querySelector("#stories");
						while(stories.lastChild) {
							stories.removeChild(stories.lastChild);
						}
						MSPFA.slide[0]();
					}
				}
			}
			var sfavs = document.querySelectorAll(".fav");
			for(var i = 0; i < sfavs.length; i++) {
				if(sfavs[i]._s.e.indexOf(MSPFA.me.i) != -1 || MSPFA.me.p) {
					sfavs[i].previousSibling.previousSibling.style.display = "";
				}
				var gi = sfavs[i]._s.g.indexOf(MSPFA.me.i);
				if(sfavs[i]._s.f.indexOf(MSPFA.me.i) != -1 || gi != -1) {
					sfavs[i].classList.add("fav");
					sfavs[i].classList.add("major");
					sfavs[i].classList.add("lit");
					sfavs[i].nextSibling.nextSibling.style.display = "";
					if(gi != -1) {
						sfavs[i].nextSibling.nextSibling.classList.add("notify");
						sfavs[i].nextSibling.nextSibling.classList.add("major");
						sfavs[i].nextSibling.nextSibling.classList.add("lit");
					}
				}
			}
		}
	}; // note: end of login()
	var warning = document.querySelector("#warning");
	// document.cookie = "magic=real; path=/;"; // riking: do not test cookies
	if(false && document.cookie) { // riking: do not test cookies
		try {
			localStorage.magic = "real";
			window.gapiLoad = function() {
				gapi.load("auth2", function() {
					if(gapi.auth2) {
						gapi.auth2.init().then(function(auth2) {
							if(idtoken = auth2.currentUser.get().getAuthResponse().id_token) {
								if(!oldUser) {
									MSPFA.request(1, {
										do: "login"
									}, login);
								} else {
									var oldLogin = document.querySelector("#oldlogin");
									MSPFA.dialog("Login", document.createTextNode("Loading old user data..."), []);
									MSPFA.request(1, {
										do: "login",
										old: 1,
										user: oldLogin.user.value,
										pass: oldLogin.pass.value
									}, login, function(status) {
										gapi.auth2.getAuthInstance().signOut();
										if(status == 403) {
											MSPFA.dialog("Error", document.createTextNode("Your login information is incorrect."), ["Okay"]);
										}
									});
								}
								if(location.pathname != "/login/" && location.pathname != "/my/messages/") {
									relog = setInterval(loadNotifications, 300000);
								}
							} else {
								if(location.pathname.indexOf("/my/") == 0) {
									location.replace("/login/?r=" + location.href.slice(location.origin.length));
								} else {
									/*
									if(document.cookie.indexOf("t=") == -1) {
										var themeLink = "/css/theme" + MSPFA.me.s.t + ".css";
										if(theme.href != themeLink) {
											document.cookie = "t=" + MSPFA.me.s.t + "; path=/;";
											theme.href = themeLink;
										}
									}
									*/
								}
							}
						}, function(err) {
							console.error(err);
							warning.style.display = "";
							warning.innerText = "The Google API is not working on your device. This may be due to disabled cookies or the site being blocked by your internet service provider.";
						});
					} else {
						warning.style.display = "";
						warning.innerText = "Your browser seems to have an extension or plug-in enabled that is messing with the Google login API. It is recommended that you disable it so that you are able to browse MSPFA without any login issues. Known apps to cause this problem include: AdBlock, Ghostery";
					}
				});
			};
			if(window.gapi) {
				if(gapi.load) {
					gapiLoad();
				} else {
					warning.style.display = "";
					warning.innerText = "Your browser seems to have an extension or plug-in enabled that is messing with the Google login API. It is recommended that you disable it so that you are able to browse MSPFA without any login issues. Known apps to cause this problem include: AdBlock, Ghostery";
				}
			}
		} catch(err) {
			warning.style.display = "";
			warning.innerText = "It seems that you have browser storage disabled, which will cause you to experience issues while browsing the site. Please enable your browser storage.";
		}
	} else if (false) { // riking: do not show disabled-cookies warning
		warning.style.display = "";
		warning.innerText = "It seems that you have browser cookies disabled, which will cause you to experience issues while browsing the site. Please enable your browser cookies.";
	}
	if(location.pathname == "/" && params.s == undefined) {
		document.querySelector("#feature").addEventListener("click", function() {
			location.href = "/feature/";
		});
		var stories = document.querySelector("#stories");
		var getStoryTile = function(story, status) {
			var s = document.createElement("a");
			s.classList.add("story");
			s.href = "/?s=" + story.i + "&p=1";
			var icon = new Image();
			icon.width = icon.height = 150;
			icon.src = story.o || "/images/wat/random.njs?cb=" + story.i;
			s.appendChild(icon);
			s.appendChild(document.createElement("br"));
			var name = document.createElement("span");
			name.style.fontWeight = "bolder";
			name.style.fontSize = "16px";
			name.innerText = story.n;
			s.appendChild(name);
			s.appendChild(document.createElement("br"));
			s.appendChild(document.createTextNode(getStatus(story.h) + " "));
			s.appendChild(pageIcon.cloneNode(false));
			s.appendChild(document.createTextNode(story.p + " "));
			s.appendChild(heartIcon.cloneNode(false));
			s.appendChild(document.createTextNode(story.f.length+story.g.length));
			return s;
		};
		var arrowPrev = function(t, offset, req) {
			if(t.classList.contains("lit")) {
				t.classList.remove("lit");
				offset--;
				var useReq = {
					do: "stories",
					m: 2,
					f: offset
				};
				for(var i in req) {
					useReq[i] = req[i];
				}
				MSPFA.request(0, useReq, function(s) {
					var olds = t.parentNode.querySelectorAll(".story");
					olds[olds.length-1].parentNode.removeChild(olds[olds.length-1]);
					t.parentNode.insertBefore(getStoryTile(s[0]), t.parentNode.firstChild);
					if(t.nextSibling && !t.nextSibling.classList.contains("lit")) {
						t.nextSibling.classList.add("lit");
					}
					if(offset > 0) {
						t.classList.add("lit");
					}
				});
			}
			return offset;
		};
		var arrowNext = function(t, offset, req) {
			if(t.classList.contains("lit")) {
				t.classList.remove("lit");
				offset++;
				var useReq = {
					do: "stories",
					m: 2,
					f: offset+4
				};
				for(var i in req) {
					useReq[i] = req[i];
				}
				MSPFA.request(0, useReq, function(s) {
					var olds = t.parentNode.querySelector(".story");
					olds.parentNode.removeChild(olds);
					t.parentNode.appendChild(getStoryTile(s[0]));
					if(t.previousSibling && !t.previousSibling.classList.contains("lit")) {
						t.previousSibling.classList.add("lit");
					}
					if(s.length > 1) {
						t.classList.add("lit");
					}
				});
			}
			return offset;
		};
		var arrow = document.createElement("input");
		arrow.setAttribute("type", "button");
		arrow.classList.add("arrow");
		var req = {/*
			"Recently Updated": {
				n: "",
				t: "",
				p: "p",
				o: "updated",
				h: 14
			},*/
			"Top Ongoing Favorites": {
				n: "",
				t: "",
				p: "p",
				o: "favs",
				h: 4
			},
			"Top Complete Favorites": {
				n: "",
				t: "",
				p: "p",
				o: "favs",
				h: 8
			},/*
			"Most Pages": {
				n: "",
				t: "",
				p: "p",
				o: "length",
				h: 12
			},*/
			"Random": {
				n: "",
				t: "",
				p: "p",
				o: "random",
				h: 14
			}
		};
		var arrows = [];
		for(var i in req) {
			(function(i) {
				var tr = document.createElement("tr");
				var td = document.createElement("td");
				var h = document.createElement("h2");
				var ha = document.createElement("a");
				ha.classList.add("major");
				var reqstr = "";
				for(var j in req[i]) {
					reqstr += "&" + j + "=" + req[i][j];
				}
				ha.href = "/stories/?go=1&m=50&" + reqstr;
				ha.innerText = i.toUpperCase();
				h.appendChild(ha);
				td.appendChild(h);
				tr.appendChild(td);
				stories.appendChild(tr);
				var tr = document.createElement("tr");
				var td = document.createElement("td");
				td.classList.add("storyholder");
				var arrow1 = arrow.cloneNode(false);
				arrow1.classList.add("right");
				td.appendChild(arrow1);
				var arrow2 = arrow.cloneNode(false);
				arrow2.classList.add("left");
				td.appendChild(arrow2);
				arrows.push(arrow1, arrow2);
				var useReq = {
					do: "stories",
					m: 6
				};
				for(var j in req[i]) {
					useReq[j] = req[i][j];
				}
				MSPFA.request(0, useReq, function(s) {
					for(var j = 0; j < Math.min(5, s.length); j++) {
						td.appendChild(getStoryTile(s[j]));
					}
					if(s.length > 5) {
						arrow2.classList.add("lit");
					}
					var offset = 0;
					arrow1.addEventListener("click", function() {
						offset = arrowPrev(this, offset, req[i]);
					});
					arrow2.addEventListener("click", function() {
						offset = arrowNext(this, offset, req[i]);
					});
				});
				tr.appendChild(td);
				stories.appendChild(tr);
			})(i);
		}
		var displayArrows = function() {
			var arrowDisplay = "";
			if(document.body.offsetWidth < 1160) {
				arrowDisplay = "none";
			}
			for(var i = 0; i < arrows.length; i++) {
				arrows[i].style.display = arrowDisplay;
			}
		};
		displayArrows();
		window.addEventListener("resize", displayArrows);
	} else if ((/\/view.html$/).test(location.pathname)) { // riking: change story view test
		// LANDMARK: Start story view
		var p = parseInt(params.p) || 1;
		MSPFA.story = {};
		var page = {};
		var slidee = document.querySelector("#slide");
		var info = document.querySelector("#info");
		var command = document.querySelector("#command");
		var content = document.querySelector("#content");
		var links = document.querySelector("#links");
		var prevlinks = document.querySelector("#prevlinks");
		var gamelinks = document.querySelector("#gamelinks");
		var goback = document.querySelector("#goback");
		var startover = document.querySelector("#startover");
		var historyState = null;
		var ct = document.createElement("table");
		var ctb = document.createElement("tbody");
		var sc = 0;
		var loadingComments = false;
		var loadComments;
		var loaded = false;
		var commente = MSPFA.parseBBCode("[spoiler open=\"Show Comments\" close=\"Hide Comments\"][/spoiler]");
		commente.id = "commentbox";
		var comments = commente.querySelector(".spoiler");
		comments.style.marginTop = "8px";
		var commentc = commente.querySelector(".spoiler > div:nth-child(2)");
		var pageRanges = {};
		var slinkSlide = function(as) {
			for(var i = 0; i < as.length; i++) {
				var asRawParams;
				if(as[i].href.indexOf("//") != -1) {
					asRawParams = as[i].href.slice(as[i].href.indexOf("//")+2);
				} else {
					asRawParams = as[i].href;
				}
				if(asRawParams.indexOf("mspfa") != 0) {
					as[i].href = toArchiveURL("web", as[i].href); // riking: edit link URLs to archive links
					continue;
				}
				if(asRawParams.indexOf("#") != -1) {
					asRawParams = as[i].href.slice(0, as[i].href.indexOf("#"));
				}
				if(asRawParams.indexOf("?") != -1) {
					asRawParams = asRawParams.slice(asRawParams.indexOf("?")+1).split("&");
				} else {
					asRawParams = [];
				}
				var asParams = {};
				for(var j = 0; j < asRawParams.length; j++) {
					var p2 = asRawParams[j].split("=");
					asParams[p2[0]] = decodeURIComponent(p2[1]);
				}
				if(parseInt(asParams.s) == MSPFA.story.i) {
					as[i].addEventListener("click", linkSlide);
				} else { // [BEGIN] riking: redirect to archived stories, ideally
					// TODO
					// [END]
				}
			}
		};
		var slidefdone = false;
		MSPFA.page = function(pg) {
			try {
				p = parseInt(pg);
				document.body.scrollTop = document.documentElement.scrollTop = 0;
				if(location.pathname == "/preview/") {
					page = JSON.parse(params.d);
				} else {
					historyState = "?s=" + MSPFA.story.i + "&p=" + p; // riking: relative queries
					if(location.href.slice(-historyState.length) != historyState) {
						history.pushState(null, "", historyState);
					}
					page = MSPFA.story.p[p-1];
				}
				if(page) {
					document.documentElement.className = "p" + p;
					for(var i in pageRanges) {
						if(p >= pageRanges[i][0] && p <= pageRanges[i][1]) {
							document.documentElement.classList.add(i);
						}
					}
					var backid = 0;
					if(location.pathname != "/preview/") {
						for(var i = p-1; i >= 0; i--) {
							if(MSPFA.story.p[i].n.indexOf(p) != -1) {
								backid = i+1;
							}
						}
						if(!backid) {
							for(var i = p+1; i < MSPFA.story.p.length; i++) {
								if(MSPFA.story.p[i].n.indexOf(p) != -1) backid = i+1;
							}
						}
					}
					if(backid) {
						goback.parentNode.style.display = "";
						goback.href = "?s=" + MSPFA.story.i + "&p=" + backid; // riking: relative queries
					} else {
						goback.parentNode.style.display = "none";
						goback.href = "?s=" + MSPFA.story.i + "&p=" + p; // riking: relative queries
					}
					if(p > 1 && location.pathname != "/preview/") {
						prevlinks.style.display = "";
					} else {
						prevlinks.style.display = "none";
					}
					if(command.lastChild) {
						command.removeChild(command.lastChild);
					}
					if(content.lastChild) {
						content.removeChild(content.lastChild);
					}
					command.appendChild(MSPFA.parseBBCode(page.c || MSPFA.story.m));
					var b = MSPFA.parseBBCode("\n" + page.b);
					var imgs = b.querySelectorAll("img, video, iframe, canvas, object, embed"); // riking: include <embed>
					var pad = getComputedStyle(slidee);
					if(pad) {
						pad = parseFloat(pad.paddingLeft) + parseFloat(pad.paddingRight);
					} else {
						pad = 50;
					}
					var loadImg = function() {
						if(this.offsetWidth+pad < slidee.offsetWidth) {
							this.classList.remove("major");
						}
					};
					for(var i = 0; i < imgs.length; i++) {
						imgs[i].classList.add("major");
						imgs[i].addEventListener("load", loadImg);
						imgs[i].addEventListener("error", loadImg);
						// [BEGIN] riking: Change resource URLs to archive links
						switch (imgs[i].tagName) {
						case "IMG":
						case "IFRAME":
						case "EMBED":
							imgs[i].src = toArchiveURL("resource", imgs[i].src);
							break;
						case "OBJECT":
							imgs[i].data = toArchiveURL("resource", imgs[i].data);
						case "VIDEO":
							if (imgs[i].src) {
								imgs[i].src = toArchiveURL("resource", imgs[i].src);
							} else {
								// TODO - edit each <source> url
							}
						}
						// [END]
					}
					if(location.pathname != "/preview/") {
						// riking: slinkSlide changes URLs to web-archive URLs
						slinkSlide(b.querySelectorAll("a[href], area[href]"));
					}
					content.appendChild(b);
					while(links.lastChild) {
						links.removeChild(links.lastChild);
					}
					if(location.pathname != "/preview/") {
						for(var i = 0; i < page.n.length; i++) {
							if(MSPFA.story.p[page.n[i]-1]) {
								var line = document.createElement("div");
								var link = document.createElement("a");
								link.href = "?s=" + MSPFA.story.i + "&p=" + page.n[i]; // riking: relative queries
								link.appendChild(MSPFA.parseBBCode(MSPFA.story.p[page.n[i]-1].c || MSPFA.story.m));
								link.addEventListener("click", linkSlide);
								line.appendChild(link);
								links.appendChild(line);
							}
						}
					}
					sc = 0;
					while(ctb.lastChild) {
						ctb.removeChild(ctb.lastChild);
					}
					try {
						for(var i = 0; i < ums.length; i++) {
							if(ums[i].contentWindow) {
								ums[i].contentWindow.postMessage("refresh", location.href);
							}
						}
					} catch(err) {}
					for(var i = 0; i < MSPFA.slide.length; i++) {
						if(typeof MSPFA.slide[i] == "function") {
							MSPFA.slide[i](p, i);
						}
					}
					slidefdone = true;
				} else {
					adv404(); // riking: 404 handler
				}
			} catch(err) {
				if(location.pathname == "/preview/") {
					MSPFA.dialog("Error", document.createTextNode("Your page data is invalid."), ["Okay"]);
				} else {
					throw err;
				}
			}
		};
		var linkSlide = function(evt) {
			if(!evt.ctrlKey && !evt.metaKey) {
				evt.preventDefault();
				// [BEGIN] riking: change parsing to URLSearchParams
				var u = new URL(this.href, location);
				MSPFA.page(parseInt(u.searchParams.get('p')) || 1);
				// [END]
			}
		};
		MSPFA.request(0, {
			do: "story",
		}, function(v) {
			MSPFA.story = v;
			if(MSPFA.story.l || (!MSPFA.story.p.length && location.pathname != "/preview/")) {
				adv404(); // riking: replace story 404 handler
				return;
			}
			document.title = MSPFA.story.n;
			var ecss = document.createElement("style");
			ecss.appendChild(document.createTextNode(MSPFA.story.y));
			document.head.appendChild(ecss);
			var registeredImports = [];
			var registerPageRanges = function(cssString, asyncLoad) {
				var findPageRanges = /\.p(\d+-(?:\d+)?)/g;
				var pageRangeMatch;
				while(pageRangeMatch = findPageRanges.exec(cssString)) {
					if(!pageRanges["p" + pageRangeMatch[1]]) {
						var pageRange = pageRangeMatch[1].split("-");
						pageRange[0] = parseInt(pageRange[0]);
						pageRange[1] = parseInt(pageRange[1]) || MSPFA.story.p.length;
						if(pageRange[0] > pageRange[1]) {
							pageRange.reverse();
						}
						pageRanges["p" + pageRangeMatch[1]] = pageRange;
						if(asyncLoad) {
							if(p >= pageRange[0] && p <= pageRange[1]) {
								document.documentElement.classList.add("p" + pageRangeMatch[1]);
							}
						}
					}
				}
				var imports = [];
				var findImports = /@import (?:url\(("|')?(.+?)\1\)|("|')?(.+?)\3)(?: .+?)?(?:;|\n)?/g;
				var importMatch;
				while(importMatch = findImports.exec(cssString)) {
					imports.push(importMatch[2] || importMatch[4]);
				}
				for(var i = 0; i < imports.length; i++) {
					if(registeredImports.indexOf(imports[i] == -1)) {
						try {
							cssString.replace(imports[i], toArchiveURL("resource", imports[i]));
							registeredImports.push(imports[i]);
							var req = new XMLHttpRequest();
							req.open("GET", toArchiveURL("resource", imports[i]), true);
							req.onreadystatechange = function() {
								if(req.readyState == XMLHttpRequest.DONE && req.status == 200 && req.responseText) {
									registerPageRanges(req.responseText, true);
								}
							};
							req.send();
						} catch(err) {}
					}
				}
			};
			registerPageRanges(MSPFA.story.y);
			startover.href = "?s=" + MSPFA.story.i + "&p=1"; // riking: relative queries
			startover.addEventListener("click", linkSlide);
			window.addEventListener("keydown", function(evt) {
				if(!page || page.k || document.querySelector("textarea:focus, input[type=\"text\"]:focus, input[type=\"number\"]:focus, input[type=\"password\"]:focus, input[type=\"email\"]:focus")) {
					return;
				}
				var prevent = true;
				// TODO: allow multiple next/prev keycodes
				switch(evt.keyCode) {
					case MSPFA.me.s.k.p:
						if(location.pathname != "/preview/") {
							var clink = "?s=" + MSPFA.story.i + "&p=" + p; // riking: relative queries
							if(goback.href.indexOf(clink) != goback.href.length-clink.length) {
								goback.click();
							}
						}
						break;
					case MSPFA.me.s.k.n:
						if(location.pathname != "/preview/") {
							var nextpage = links.querySelector("a");
							if(nextpage) {
								nextpage.click();
							}
						}
						break;
					case MSPFA.me.s.k.s:
						var sb = content.querySelectorAll(".spoiler > div:first-child > input");
						for(var i = 0; i < sb.length; i++) {
							sb[i].click();
						}
						break;
					default:
						prevent = false;
						break;
				}
				if(prevent) {
					evt.preventDefault();
				}
			});
			if(location.pathname != "/preview/") {
				goback.addEventListener("click", linkSlide);
				window.addEventListener("popstate", function() {
					if(historyState && location.href.slice(-historyState.length) != historyState) {
						location.reload();
					}
				});
				var infoe = MSPFA.parseBBCode("[spoiler open=\"Show Adventure Info\" close=\"Hide Adventure Info\"][/spoiler]");
				infoe.id = "infobox";
				var infoc = infoe.querySelector(".spoiler > div:nth-child(2)");
				var t = document.createElement("table");
				var tb = document.createElement("tbody");
				var tr1 = document.createElement("tr");
				var td1 = document.createElement("td");
				td1.style.width = "158px";
				var icon = new Image();
				icon.id = "storyicon";
				icon.width = icon.height = 150;
				// [BEGIN] riking: move random images to clientside
				icon.src = MSPFA.story.o || (function() {
					var r = Math.floor(Math.random() * 4);
					return "./assets/wat/wat.njs." + r;
				})();
				// [END]
				icon.style.marginRight = "6px";
				td1.appendChild(icon);
				tr1.appendChild(td1);
				var td2 = document.createElement("td");
				td2.style.width = td2.style.maxWidth = "413px";
				var title = document.createElement("span");
				title.classList.add("major");
				title.style.fontSize = "20px";
				title.innerText = MSPFA.story.n;
				td2.appendChild(title);
				td2.appendChild(document.createTextNode(" "));
				var sedit = edit.cloneNode(false);
				// riking: disable edit button
				if(false && (idtoken && (MSPFA.story.e.indexOf(MSPFA.me.i) != -1 || MSPFA.me.p))) {
					sedit.style.display = "";
				}
				sedit.addEventListener("click", function() {
					location.href = "/my/stories/info/?s=" + MSPFA.story.i;
				});
				// td2.appendChild(sedit); // riking: disable edit button
				td2.appendChild(document.createTextNode(" "));
				var sfav = fav.cloneNode(false);
				sfav._s = MSPFA.story;
				sfav.addEventListener("click", updateFav);
				// td2.appendChild(sfav); // riking: disable favorite button
				td2.appendChild(document.createTextNode(" "));
				var snotify = notify.cloneNode(false);
				snotify.addEventListener("click", updateNotify);
				// td2.appendChild(snotify); // riking: disable notify button
				var gi = MSPFA.story.g.indexOf(MSPFA.me.i);
				// riking: disable favorite button
				if(false && (idtoken && (MSPFA.story.f.indexOf(MSPFA.me.i) != -1 || gi != -1))) {
					sfav.classList.remove("unlit");
					sfav.classList.add("lit");
					snotify.style.display = "";
					if(gi != -1) {
						snotify.classList.remove("unlit");
						snotify.classList.add("lit");
					}
				}
				td2.appendChild(document.createElement("br"));
				td2.appendChild(document.createTextNode(getStatus(MSPFA.story.h) + " "));
				td2.appendChild(pageIcon.cloneNode(false));
				td2.appendChild(document.createTextNode(MSPFA.story.p.length + " "));
				td2.appendChild(heartIcon.cloneNode(false));
				td2.appendChild(document.createTextNode(MSPFA.story.f.length+MSPFA.story.g.length));
				td2.appendChild(document.createElement("br"));
				td2.appendChild(document.createTextNode("Author: "));
				var creator = document.createElement("a");
				if(MSPFA.story.w) {
					creator.href = MSPFA.story.w;
				}
				creator.innerText = MSPFA.story.a;
				td2.appendChild(creator);
				td2.appendChild(document.createElement("br"));
				td2.appendChild(document.createTextNode("Mirrored by: "));
				var mirrorers = document.createElement("span");
				var addMirrorer = function(id) {
					MSPFA.request(0, {
						do: "user",
						u: id
					}, function(user) {
						var a = document.createElement("a");
						a.href = "/user/?u=" + user.i;
						a.innerText = user.n;
						if(user.i == MSPFA.story.c) {
							mirrorers.insertBefore(a, mirrorers.firstChild);
						} else {
							mirrorers.appendChild(document.createTextNode(", "));
							mirrorers.appendChild(a);
						}
					});
				};
				for(var i = 0; i < MSPFA.story.e.length; i++) {
					addMirrorer(MSPFA.story.e[i]);
				}
				td2.appendChild(mirrorers);
				td2.appendChild(document.createElement("br"));
				if(MSPFA.story.t.length) {
					td2.appendChild(document.createTextNode("Tags: " + MSPFA.story.t.join(", ")));
				} else {
					td2.appendChild(document.createTextNode("No tags"));
				}
				td2.appendChild(document.createElement("br"));
				td2.appendChild(document.createTextNode("ID: "));
				var sid = document.createElement("input");
				sid.readOnly = true;
				sid.size = MSPFA.story.i.toString().length;
				sid.value = MSPFA.story.i;
				sid.addEventListener("focus", function() {
					this.select();
				});
				td2.appendChild(sid);
				td2.appendChild(document.createElement("br"));
				tr1.appendChild(td2);
				var td3 = document.createElement("td");
				td3.id = "latestpages";
				td3.setAttribute("rowspan", "2");
				td3.style.width = td3.style.maxWidth = "253px";
				td3.style.fontSize = "10px";
				td3.style.fontWeight = "bold";
				var lpse = MSPFA.parseBBCode("[spoiler open=\"Show Latest Pages\" close=\"Hide Latest Pages\"][/spoiler]");
				var lpsc = lpse.querySelector(".spoiler > div:nth-child(2)");
				lpsc.appendChild(document.createTextNode("Latest Pages:"));
				for(var i = MSPFA.story.p.length-1; i >= 0 && i >= MSPFA.story.p.length-30; i--) {
					lpsc.appendChild(document.createElement("br"));
					var thiscmd = document.createElement("span");
					thiscmd.appendChild(document.createTextNode(fetchDate(new Date(MSPFA.story.p[i].d)) + " - "));
					var cmdlink = document.createElement("a");
					cmdlink.href = "?s=" + MSPFA.story.i + "&p=" + (i+1); // riking: relative queries
					cmdlink.appendChild(document.createTextNode("\""));
					cmdlink.appendChild(MSPFA.parseBBCode(MSPFA.story.p[i].c || MSPFA.story.m));
					cmdlink.appendChild(document.createTextNode("\""));
					cmdlink.addEventListener("click", linkSlide);
					thiscmd.appendChild(cmdlink);
					lpsc.appendChild(thiscmd);
				}
				td3.appendChild(lpse);
				td3.appendChild(document.createElement("br"));
				td3.appendChild(document.createElement("br"));
				var viewAllPagesContainer = document.createElement("div");
				viewAllPagesContainer.style.textAlign = "center";
				var viewAllPages = document.createElement("a");
				viewAllPages.href = "./log.html/?s=" + MSPFA.story.i; // riking: redirect log url
				viewAllPages.style.fontSize = "14px";
				viewAllPages.innerText = "VIEW ALL PAGES";
				viewAllPagesContainer.appendChild(viewAllPages);
				td3.appendChild(viewAllPagesContainer);
				tr1.appendChild(td3);
				tb.appendChild(tr1);
				var tr2 = document.createElement("tr");
				var td4 = document.createElement("td");
				td4.setAttribute("colspan", "2");
				td4.style.width = td4.style.maxWidth = "575px";
				var storyr = MSPFA.parseBBCode(MSPFA.story.r);
				slinkSlide(storyr.querySelectorAll("a[href], area[href]"));
				td4.appendChild(storyr);
				tr2.appendChild(td4);
				tb.appendChild(tr2);
				t.appendChild(tb);
				document.body.appendChild(t);
				var theight = t.offsetHeight;
				td4.style.height = theight + "px";
				td4.style.height = (theight-Math.max(td1.offsetHeight, td2.offsetHeight)) + "px";
				infoc.appendChild(t);
				info.appendChild(infoe);
				if(false && MSPFA.story.b) { // riking: Disable comments
					var newcommentc = document.createElement("form");
					newcommentc.id = "newcomment";
					newcommentc.appendChild(document.createTextNode("Post a new comment:"));
					var newcomment = document.createElement("textarea");
					newcomment.setAttribute("maxlength", "2000");
					newcomment.rows = 8;
					newcomment.required = true;
					newcomment.style.boxSizing = "border-box";
					newcomment.style.width = "100%";
					newcommentc.appendChild(newcomment);
					bbtoolbar.querySelector("input[data-tag=\"flash\"]").style.display = "none";
					bbe = newcomment;
					bbe.parentNode.insertBefore(bbtoolbar, bbe);
					bbtoolbar.style.display = "";
					newcommentc.appendChild(document.createElement("br"));
					var postcomment = document.createElement("input");
					postcomment.classList.add("major");
					postcomment.setAttribute("type", "submit");
					postcomment.value = "Post";
					newcommentc.appendChild(postcomment);
					commentc.appendChild(newcommentc);
					commentc.appendChild(document.createElement("br"));
					commentc.appendChild(document.createElement("br"));
					commentc.appendChild(document.createTextNode("Sort by: "));
					var sortc = document.createElement("select");
					var sortcPage = document.createElement("option");
					sortcPage.value = "page";
					sortcPage.innerText = "Page Number";
					sortc.appendChild(sortcPage);
					var sortcNewest = document.createElement("option");
					sortcNewest.value = "newest";
					sortcNewest.innerText = "Newest";
					sortc.appendChild(sortcNewest);
					var sortcOldest = document.createElement("option");
					sortcOldest.value = "oldest";
					sortcOldest.innerText = "Oldest";
					sortc.appendChild(sortcOldest);
					var sortcRating = document.createElement("option");
					sortcRating.value = "rating";
					sortcRating.innerText = "Rating";
					sortc.appendChild(sortcRating);
					commentc.appendChild(sortc);
					commentc.appendChild(document.createElement("br"));
					commentc.appendChild(document.createElement("br"));
					var clickGear = function() {
						var t = this;
						var btns = ["Report", "View Source"];
						if(idtoken) {
							if(MSPFA.me.i == t.parentNode.parentNode._c.u) {
								btns.push("Edit");
							}
							if(MSPFA.me.i == t.parentNode.parentNode._c.u || MSPFA.me.p || MSPFA.story.e.indexOf(MSPFA.me.i) != -1) {
								btns.push("Delete");
							}
						}
						btns.push("Cancel");
						var msg = document.createElement("span");
						msg.appendChild(document.createTextNode("You have successfully clicked a comment gear."));
						msg.appendChild(document.createElement("br"));
						msg.appendChild(document.createTextNode("What will you do?"));
						var modc = function(output) {
							if(output == "Report") {
								setTimeout(function() {
									btns[btns.indexOf(output)] = "Bread";
									MSPFA.dialog("Comment", msg, btns, modc);
								});
							} else if(output == "View Source") {
								setTimeout(function() {
									var old = newcomment.cloneNode(false);
									old.value = t.parentNode.parentNode._c.b;
									old.readOnly = true;
									old.style.width = "830px";
									MSPFA.dialog("Comment", old, ["Okay"]);
									old.focus();
								});
							} else if(output == "Bread") {
								setTimeout(function() {
									var bread = new Image();
									bread.src = "/images/bread.png";
									MSPFA.dialog("Bread", bread, []);
								});
							} else if(output == "Delete") {
								MSPFA.request(1, {
									do: "delcomment",
									s: MSPFA.story.i,
									d: t.parentNode.parentNode._c.d
								}, function() {
									if(sc != -1) {
										sc--;
									}
									t.parentNode.parentNode.parentNode.removeChild(t.parentNode.parentNode);
								});
							} else if(output == "Edit") {
								setTimeout(function() {
									var msg2 = document.createElement("span");
									msg2.appendChild(document.createTextNode("Edit comment:"));
									msg2.appendChild(document.createElement("br"));
									var old = newcomment.cloneNode(false);
									old.value = t.parentNode.parentNode._c.b;
									old.style.width = "830px";
									msg2.appendChild(old);
									MSPFA.dialog("Comment", msg2, ["Save", "Cancel"], function(output) {
										if(output == "Save") {
											MSPFA.request(1, {
												do: "editcomment",
												s: MSPFA.story.i,
												d: t.parentNode.parentNode._c.d,
												b: old.value
											}, function(v) {
												t.parentNode.parentNode._c = v;
												t.parentNode.removeChild(t.parentNode.lastChild);
												var cbody = MSPFA.parseBBCode(v.b, true);
												var sizes = cbody.querySelectorAll("span");
												for(var i = 0; i < sizes.length; i++) {
													if(sizes[i].style.fontSize && (parseInt(sizes[i].style.fontSize) > 100 || sizes[i].style.fontSize.indexOf("e+") != -1)) {
														sizes[i].style.fontSize = "100px";
													}
												}
												slinkSlide(cbody.querySelectorAll("a[href], area[href]"));
												t.parentNode.appendChild(cbody);
											});
										}
									});
									old.focus();
								});
							}
						};
						MSPFA.dialog("Comment", msg, btns, modc);
					};
					var clickRate = function() {
						if(idtoken && !MSPFA.me.f) {
							var rates = [this.previousSibling ? this.previousSibling.previousSibling : this, this.nextSibling ? this.nextSibling.nextSibling : this];
							rates[0].disabled = rates[1].disabled = true;
							var rateti = this.classList.contains("lit") ? -1 : (this.classList.contains("up") ? 0 : 1);
							MSPFA.request(1, {
								do: "ratecomment",
								s: MSPFA.story.i,
								d: this.parentNode.parentNode.parentNode._c.d,
								r: rateti+1
							}, function(v) {
								rates[0].classList.remove("lit");
								rates[0].classList.add("unlit");
								rates[1].classList.remove("lit");
								rates[1].classList.add("unlit");
								if(rateti != -1) {
									rates[rateti].classList.remove("unlit");
									rates[rateti].classList.add("lit");
								}
								rates[0].value = v[0];
								rates[1].value = v[1];
								rates[0].disabled = rates[1].disabled = false;
							});
						} else {
							MSPFA.dialog("Error", document.createTextNode("You must be logged in to rate comments."), ["Log in", "Cancel"], function(output) {
								if(output == "Log in") {
									location.href = "/login/?r=" + encodeURIComponent(location.href);
								}
							});
						}
					};
					loadComments = function(load) {
						if(loadingComments) {
							return;
						}
						loadingComments = true;
						var req = {
							do: "comments",
							s: MSPFA.story.i,
							p: p,
							o: sortc.value
						};
						if(load == 2) {
							req.f = sc;
							sc += 10;
						} else {
							sc = 10;
							while(ctb.lastChild) {
								ctb.removeChild(ctb.lastChild);
							}
						}
						MSPFA.request(0, req, function(c) {
							if(c.c.length < 10) {
								sc = -1;
								if(!c.c.length) {
									loadingComments = false;
									return;
								}
							}
							var gear = document.createElement("div");
							gear.classList.add("gear");
							var rate = document.createElement("input");
							rate.classList.add("major");
							rate.setAttribute("type", "button");
							for(var i = 0; i < c.c.length; i++) {
								var ctr = document.createElement("tr");
								ctr._c = c.c[i];
								ctr.classList.add("comment");
								ctr.classList.add("c" + c.c[i].d);
								ctr.classList.add("u" + c.c[i].u);
								if(c.u[c.c[i].u].p) {
									ctr.classList.add("mod");
								}
								if(c.c[i].user == MSPFA.story.c) {
									ctr.classList.add("owner");
								}
								if(MSPFA.story.e.indexOf(c.c[i].u) != -1) {
									ctr.classList.add("mirrorer");
								}
								var ctd1 = document.createElement("td");
								var imglink = document.createElement("a");
								var img = new Image();
								img.classList.add("cellicon");
								img.src = c.u[c.c[i].u].o || "/images/wat/random.njs?cb=" + c.c[i].d;
								imglink.appendChild(img);
								ctd1.appendChild(imglink);
								ctr.appendChild(ctd1);
								var ctd2 = document.createElement("td");
								var u = document.createElement("a");
								u.classList.add("username");
								imglink.href = u.href = "/user/?u=" + c.c[i].u;
								u.innerText = c.u[c.c[i].u].n;
								ctd2.appendChild(u);
								ctd2.appendChild(document.createTextNode(" "));
								var page = document.createElement("a");
								page.classList.add("page");
								page.href = "/?s=" + MSPFA.story.i + "&p=" + c.c[i].p;
								page.addEventListener("click", linkSlide);
								page.appendChild(document.createTextNode("(on page " + c.c[i].p + ")"));
								ctd2.appendChild(page);
								ctd2.appendChild(document.createTextNode(" "));
								var timestamp = document.createElement("span");
								timestamp.classList.add("timestamp");
								timestamp.appendChild(document.createTextNode(fetchDate(new Date(c.c[i].d), true)));
								ctd2.appendChild(timestamp);
								var cgear = gear.cloneNode(false);
								cgear.addEventListener("click", clickGear);
								ctd2.appendChild(cgear);
								ctd2.appendChild(document.createElement("br"));
								var rates = document.createElement("span");
								rates.classList.add("rate");
								rates.classList.add("notranslate");
								var upvote = rate.cloneNode(false);
								upvote.classList.add("up");
								upvote.classList.add((idtoken && c.c[i].l && c.c[i].l.indexOf(MSPFA.me.i) != -1) ? "lit" : "unlit");
								upvote.value = c.c[i].l ? c.c[i].l.length : 0;
								upvote.addEventListener("click", clickRate);
								rates.appendChild(upvote);
								rates.appendChild(document.createElement("br"));
								var downvote = rate.cloneNode(false);
								downvote.classList.add("down");
								downvote.classList.add((idtoken && c.c[i].n && c.c[i].n.indexOf(MSPFA.me.i) != -1) ? "lit" : "unlit");
								downvote.value = c.c[i].n ? c.c[i].n.length : 0;
								downvote.addEventListener("click", clickRate);
								rates.appendChild(downvote);
								ctd2.appendChild(rates);
								var cbody = MSPFA.parseBBCode(c.c[i].b, true);
								var sizes = cbody.querySelectorAll("span");
								for(var j = 0; j < sizes.length; j++) {
									if(sizes[j].style.fontSize && (parseInt(sizes[j].style.fontSize) > 100 || sizes[j].style.fontSize.indexOf("e+") != -1)) {
										sizes[j].style.fontSize = "100px";
									}
								}
								slinkSlide(cbody.querySelectorAll("a[href], area[href]"));
								ctd2.appendChild(cbody);
								ctr.appendChild(ctd2);
								ctb.appendChild(ctr);
							}
							loadingComments = false;
							if(!loaded) {
								loaded = true;
							}
						});
					};
					newcommentc.addEventListener("submit", function(evt) {
						evt.preventDefault();
						if(idtoken && !MSPFA.me.f) {
							postcomment.disabled = true;
							MSPFA.request(1, {
								do: "comment",
								s: MSPFA.story.i,
								p: p,
								b: newcomment.value
							}, function() {
								postcomment.disabled = false;
								newcomment.value = "";
								loadComments();
							}, function() {
								postcomment.disabled = false;
							});
						} else {
							MSPFA.dialog("Error", document.createTextNode("You must be logged in to post a comment."), ["Log in", "Cancel"], function(output) {
								if(output == "Log in") {
									location.href = "/login/?r=" + encodeURIComponent(location.href);
								}
							});
						}
					});
					sortc.addEventListener("change", function() {
						loadComments();
					});
					var testComments = function() {
						if(comments.classList.contains("open") && !loadingComments && sc != -1) {
							var rect = ctb.getBoundingClientRect();
							if(rect.top+rect.height < window.innerHeight) {
								loadComments(2);
							}
						}
					};
					window.addEventListener("scroll", testComments);
					commente.querySelector(".spoiler > div:first-child > input").addEventListener("click", function() {
						testComments();
					});
					ct.appendChild(ctb);
					commentc.appendChild(ct);
					info.appendChild(commente);
				}
				gamelinks.style.display = "";
				document.querySelector("#savegame").addEventListener("click", function() {
					// [BEGIN] riking: Replace save implementation
					var saveTable = JSON.parse(localStorage.mspfa_save || "{}");
					saveTable[MSPFA.story.i] = p;
					localStorage.mspfa_save = JSON.stringify(saveTable);
					MSPFA.dialog("Saved", document.createTextNode("Saved your location at page " + p + " locally. Click \"Load Game\" to return to this point."), ["Ok"]);
					return;
					// [END]
				});
				document.querySelector("#loadgame").addEventListener("click", function() {
					// [BEGIN] riking: Replace save implementation
					var saveTable = JSON.parse(localStorage.mspfa_save || "{}");
					var g = saveTable[MSPFA.story.i];
					if (g) {
						MSPFA.page(g);
					} else {
						MSPFA.dialog("No Data", document.createTextNode("No save data found. Remember that saving is local to your computer."), ["Ok"]);
					}
					return;
					// [END]
				});
				document.querySelector("#deletegame").addEventListener("click", function() {
					// [BEGIN] riking: Replace save implementation
					var saveTable = JSON.parse(localStorage.mspfa_save || "{}");
					saveTable[MSPFA.story.i] = undefined;
					localStorage.mspfa_save = JSON.stringify(saveTable);
					// MSPFA.dialog("Saved", document.createTextNode("Removed save data."), ["Ok"]);
					return;
					// [END]
				});
			}
			MSPFA.page(p);
			var evalScript = document.createElement("script");
			evalScript.text = MSPFA.story.v;
			document.head.appendChild(evalScript);
			document.head.removeChild(evalScript);
			if(slidefdone) {
				for(var i = 0; i < MSPFA.slide.length; i++) {
					if(typeof MSPFA.slide[i] == "function") MSPFA.slide[i](p);
				}
			}
		}, function(status) {
			if(status == 404) {
				adv404(); // riking: replace 404
			}
		}, true);
	} else if(location.pathname == "/login/") {
		var googleSignIn = document.querySelector(".g-signin2");
		var oldLogin = document.querySelector("#oldlogin");
		var oldUserSupport = document.querySelector("#oldusersupport");
		var notOldUserSupport = document.querySelector("#notoldusersupport");
		document.querySelector("#olduserlink").addEventListener("click", function() {
			oldUser = true;
			oldLogin.style.display = "";
			this.parentNode.style.display = "none";
			oldUserSupport.style.display = "";
			oldLogin.insertBefore(googleSignIn, oldLogin.lastChild);
		});
		document.querySelector("#notolduserlink").addEventListener("click", function() {
			oldUser = false;
			oldLogin.style.display = "none";
			this.parentNode.style.display = "none";
			notOldUserSupport.style.display = "";
			oldLogin.parentNode.insertBefore(googleSignIn, oldLogin.nextSibling);
		});
		document.querySelector("#forgotpassword").addEventListener("click", function() {
			if(oldLogin.user.value) {
				MSPFA.dialog("Confirm", document.createTextNode("Are you sure you want to reset the password associated with " + oldLogin.user.value + "?"), ["Yes", "No"], function(output) {
					if(output == "Yes") {
						setTimeout(function() {
							MSPFA.dialog("Login", document.createTextNode("Loading old user data..."), []);
							MSPFA.request(1, {
								do: "login",
								old: 2,
								user: oldLogin.user.value
							}, function(legacy) {
								MSPFA.dialog("Login", document.createTextNode("A new password for " + legacy[1] + " has been sent to " + legacy[0] + "."), ["Okay"]);
							}, function(status) {
								if(status == 404) {
									MSPFA.dialog("Error", document.createTextNode("No user account was found under that username or email."), ["Okay"]);
								}
							}, true);
						});
					}
				});
			} else {
				oldLogin.user.focus();
			}
		});
	} else if(location.pathname == "/user/") {
		var userid = document.querySelector("#userid");
		var userinfo = document.querySelector("#userinfo");
		var username = document.querySelector("#username");
		var userlast = document.querySelector("#userlast");
		var userstatus = document.querySelector("#userstatus");
		var useremail = document.querySelector("#useremail");
		var usersite = document.querySelector("#usersite");
		var userdesc = document.querySelector("#userdesc");
		var usericon = document.querySelector("#usericon");
		var userstories = document.querySelector("#userstories");
		var userachievements = document.querySelector("#userachievements");
		var favstories = document.querySelector("#favstories");
		MSPFA.request(0, {
			do: "user",
			u: params.u
		}, function(user) {
			userid.value = user.i;
			username.innerText = user.n;
			if(Date.now()-user.u < 360000) {
				userstatus.querySelector("img").src = "/images/heartbeat.gif";
				userstatus.appendChild(document.createTextNode("User online."));
				userlast.innerText = "Online!";
			} else {
				userstatus.querySelector("img").src = "/images/grayheart.png";
				userstatus.appendChild(document.createTextNode("User offline."));
				userlast.innerText = fetchDate(new Date(user.u), true);
			}
			if(user.h && user.v && user.m) {
				useremail.innerText = user.m;
				useremail.href = "mailto:" + user.m;
			} else {
				useremail.parentNode.parentNode.style.display = "none";
			}
			if(user.w) {
				usersite.innerText = user.w;
				usersite.href = user.w;
			} else {
				usersite.parentNode.parentNode.style.display = "none";
				if(!user.h || !user.v || !user.m) {
					useremail.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.style.display = "none";
					document.querySelector("#usercontact").style.display = "none";
					usericon.parentNode.setAttribute("rowspan", parseInt(usericon.parentNode.getAttribute("rowspan"))-2);
				}
			}
			if(user.r) {
				userdesc.appendChild(MSPFA.parseBBCode(user.r));
			} else {
				userdesc.innerText = "N/A";
			}
			if(user.o) {
				usericon.src = user.o;
			}
			document.querySelector("#sendmsg").addEventListener("click", function() {
				sessionStorage.m = JSON.stringify({
					t: user.i
				});
				location.href = "/my/messages/new/";
			});
			favstories.addEventListener("click", function() {
				location.href = "/favs/?u=" + user.i;
			});
			if(user.s.p) {
				favstories.style.display = "";
			}
			MSPFA.request(0, {
				do: "editor",
				u: user.i
			}, function(s) {
				for(var i = s.length-1; i >= 0; i--) {
					if(!s[i].p) {
						s.splice(i, 1);
					}
				}
				if(s.length) {
					s = s.sort(function(a, b) {
						return (b.f.length+b.g.length)-(a.f.length+a.g.length);
					});
					for(var i = 0; i < s.length; i++) {
						var imgl = document.createElement("a");
						imgl.href = "/?s=" + s[i].i + "&p=1";
						var img = new Image();
						img.classList.add("cellicon");
						img.src = s[i].o || "/images/wat/random.njs?cb=" + s[i].i;
						img.title = img.alt = s[i].n;
						imgl.appendChild(img);
						userstories.appendChild(imgl);
					}
					userstories.parentNode.style.display = "";
				}
			});
			if(user.a) {
				var ua = user.a.toString(2).split("").reverse().join("");
				for(var i = 0; i < ua.length; i++) {
					if(ua[i] == "1") {
						var imgl = document.createElement("a");
						imgl.href = "/achievements/?u=" + user.i;
						var img = new Image();
						img.classList.add("cellicon");
						img.src = "/images/achievements/" + i + ".png";
						img.title = img.alt = achievements[i][0];
						imgl.appendChild(img);
						userachievements.appendChild(imgl);
					}
				}
				userachievements.parentNode.style.display = "";
			}
			userinfo.style.opacity = "";
		}, function(status) {
			if(status == 404) {
				var trs = document.querySelectorAll("#userinfo > tbody > tr");
				username.innerText = "User not found.";
				for(var i = 2; i < trs.length; i++) {
					trs[i].style.display = "none";
				}
				userinfo.style.opacity = "";
			}
		}, true);
	} else if(location.pathname == "/stories/") {
		var explore = document.querySelector("#explore");
		var search = function() {
			location.href = "/stories/?go=1&n=" + encodeURIComponent(explore.title.value) + "&t=" + encodeURIComponent(cleanArrayString(explore.tags.value).join(",")) + "&h=" + parseInt((explore.complete.checked ? "1" : "0") + (explore.ongoing.checked ? "1" : "0") + (explore.inactive.checked ? "1" : "0") + "0", 2) + "&o=" + explore.sortby.value + "&p=" + explore.order.value + "&m=" + explore.limit.value;
		};
		if(params.go) {
			explore.title.value = params.n;
			explore.tags.value = cleanArrayString(params.t);
			var status = parseInt(params.h).toString(2).split("").reverse().join("");
			if(status[1] == "1") {
				explore.inactive.checked = true;
			}
			if(status[2] == "1") {
				explore.ongoing.checked = true;
			}
			if(status[3] == "1") {
				explore.complete.checked = true;
			}
			explore.order.value = params.p;
			explore.limit.value = params.m;
			explore.sortby.value = params.o;
			MSPFA.request(0, {
				do: "stories",
				n: params.n,
				t: params.t,
				h: params.h,
				o: params.o,
				p: params.p,
				m: params.m
			}, function(s) {
				var stories = document.querySelector("#stories");
				if(s.length) {
					for(var i = 0; i < s.length; i++) {
						var storyCell = getStoryCell(s[i]);
						var rank = document.createElement("td");
						rank.classList.add("cellrank");
						rank.innerText = i+1;
						storyCell.insertBefore(rank, storyCell.firstChild);
						stories.appendChild(storyCell);
					}
				} else {
					var tr = document.createElement("tr");
					var td = document.createElement("td");
					td.appendChild(document.createTextNode("No adventures were found."));
					tr.appendChild(td);
					stories.appendChild(tr);
				}
				stories.parentNode.parentNode.parentNode.style.display = "";
			});
		} else {
			explore.inactive.checked = true;
			explore.ongoing.checked = true;
			explore.complete.checked = true;
			search();
		}
		explore.addEventListener("submit", function(evt) {
			evt.preventDefault();
			search();
		});
		var tagselect = document.querySelector("#tagselect");
		document.querySelector("#taghelp").addEventListener("click", function() {
			var tip = document.createElement("span");
			if(tagselect.value) {
				tip.appendChild(document.createTextNode(tagselect.value + ":"));
				tip.appendChild(document.createElement("br"));
			}
			tip.appendChild(document.createTextNode(tagselect.options[tagselect.selectedIndex].title));
			MSPFA.dialog("Tip", tip, ["Okay"]);
		});
		document.querySelector("#tagadd").addEventListener("click", function() {
			var tags = [];
			if(explore.tags.value) {
				tags = explore.tags.value.split(",");
			}
			if(tagselect.value && tags.indexOf(tagselect.value) == -1) {
				tags.push(tagselect.value);
			}
			explore.tags.value = tags.join(",");
			tagselect.options[0].selected = true;
		});
		explore.style.opacity = "";
	} else if ((/\/log.html$/).test(location.pathname)) { // riking: log.html
		var pages = document.querySelector("#pages");
		MSPFA.request(0, {
			do: "story",
		}, function(story) {
			if(!story.l && story.p.length) {
				var storyname = document.querySelector("#storyname");
				storyname.innerText = story.n;
				storyname.href = "view.html?s=" + story.i + "&p=1"; // riking: relative paths
				for(var i = story.p.length-1; i >= 0; i--) {
					if(i < story.p.length-1) {
						pages.appendChild(document.createElement("br"));
					}
					pages.appendChild(document.createTextNode(fetchDate(new Date(story.p[i].d)) + " - "));
					var cmdlink = document.createElement("a");
					cmdlink.href = "view.html?s=" + story.i + "&p=" + (i+1); // riking: relative paths
					cmdlink.appendChild(document.createTextNode("\""));
					cmdlink.appendChild(MSPFA.parseBBCode(story.p[i].c || story.m));
					cmdlink.appendChild(document.createTextNode("\""));
					pages.appendChild(cmdlink);
				}
				pages.style.display = "";
			} else {
				location.replace("/?s=20784&p=1");
			}
		}, function(status) {
			if(status == 404) {
				location.replace("/?s=20784&p=1");
			}
		}, true);
	} else if(location.pathname == "/search/") {
		return; // riking: disable search
		var pages = document.querySelector("#pages");
		MSPFA.request(0, {
			do: "story",
			s: params.s
		}, function(story) {
			if(!story.l && story.p.length) {
				var storyname = document.querySelector("#storyname");
				storyname.innerText = story.n;
				storyname.href = "/?s=" + story.i + "&p=1";
				for(var i = 0; i < story.p.length; i++) {
					pages.appendChild(document.createElement("br"));
					var phead = document.createElement("span");
					phead.style.fontWeight = "bold";
					phead.innerText = fetchDate(new Date(story.p[i].d));
					phead.appendChild(document.createElement("br"));
					var cmdlink = document.createElement("a");
					cmdlink.href = "/?s=" + story.i + "&p=" + (i+1);
					cmdlink.appendChild(document.createTextNode("\""));
					cmdlink.appendChild(MSPFA.parseBBCode(story.p[i].c || story.m));
					cmdlink.appendChild(document.createTextNode("\""));
					phead.appendChild(cmdlink);
					pages.appendChild(phead);
					pages.appendChild(MSPFA.parseBBCode(story.p[i].b));
					pages.appendChild(document.createElement("br"));
					pages.appendChild(document.createElement("br"));
				}
				var srem = pages.querySelectorAll("img, style, iframe, video, audio, object, embed");
				for(var i = srem.length-1; i >= 0; i--) {
					srem[i].parentNode.removeChild(srem[i]);
				}
				var sb = pages.querySelectorAll(".spoiler > div:first-child > input");
				for(var i = 0; i < sb.length; i++) {
					sb[i].click();
				}
				pages.style.display = "";
			} else {
				location.replace("/?s=20784&p=1");
			}
		}, function(status) {
			if(status == 404) {
				location.replace("/?s=20784&p=1");
			}
		}, true);
	} else if(location.pathname == "/readers/") {
		var readers = document.querySelector("#users");
		MSPFA.request(0, {
			do: "story",
			s: params.s
		}, function(story) {
			if(!story.l && story.p.length) {
				var storyname = document.querySelector("#storyname");
				storyname.innerText = story.n;
				storyname.href = "/?s=" + story.i + "&p=1";
				MSPFA.request(0, {
					do: "readers",
					s: story.i,
				}, function(users) {
					for(var i = 0; i < users.length; i++) {
						if(users[i].s.p) {
							readers.appendChild(getUserCell(users[i]));
						}
					}
					readers.parentNode.parentNode.parentNode.style.display = "";
				});
			} else {
				location.replace("/?s=20784&p=1");
			}
		}, function(status) {
			if(status == 404) {
				location.replace("/?s=20784&p=1");
			}
		}, true);
	} else if(location.pathname == "/achievements/") {
		var username = document.querySelector("#username");
		MSPFA.request(0, {
			do: "user",
			u: params.u
		}, function(user) {
			username.innerText = user.n;
			username.href = "/user/?u=" + user.i;
			var al = document.querySelector("#alist");
			al._u = user;
			var ua = user.a.toString(2).split("").reverse().join("");
			for(var i = 0; i < achievements.length; i++) {
				var tr = document.createElement("tr");
				var td1 = document.createElement("td");
				var img = new Image();
				img.classList.add("cellicon");
				img.src = "/images/achievements/" + i + ".png";
				td1.appendChild(img);
				tr.appendChild(td1);
				var td2 = document.createElement("td");
				var aname = document.createElement("span");
				aname._i = i;
				aname.classList.add("major");
				aname.innerText = achievements[i][0];
				td2.appendChild(aname);
				td2.appendChild(document.createElement("br"));
				var adesc = document.createElement("span");
				adesc.innerText = achievements[i][1];
				td2.appendChild(adesc);
				tr.appendChild(td2);
				if(ua[i] == "1") {
					tr.classList.add("lit");
				} else {
					tr.classList.add("unlit");
				}
				al.appendChild(tr);
			}
			if(typeof MSPFA.slide[1] == "function") {
				MSPFA.slide[1]();
			}
			MSPFA.slide[0] = true;
			al.parentNode.parentNode.parentNode.style.display = "";
		}, function(status) {
			if(status == 404) {
				username.innerText = "User not found.";
			}
		}, true);
	} else if(location.pathname == "/favs/") {
		var username = document.querySelector("#username");
		var stories = document.querySelector("#stories");
		MSPFA.request(0, {
			do: "user",
			u: params.u
		}, function(user) {
			username.innerText = user.n;
			username.href = "/user/?u=" + user.i;
			MSPFA.slide[0] = function() {
				MSPFA.request(0, {
					do: "favs",
					u: user.i
				}, function(s) {
					s = s.sort(function(a, b) {
						return b.u-a.u;
					});
					if(s.length) {
						for(var i = 0; i < s.length; i++) {
							stories.appendChild(getStoryCell(s[i]));
						}
					} else {
						var tr = document.createElement("tr");
						var td = document.createElement("td");
						td.appendChild(document.createTextNode("This user has no favorite adventures."));
						tr.appendChild(td);
						stories.appendChild(tr);
					}
				});
			}
			if(user.s.p) {
				MSPFA.slide[0]();
			} else {
				if(MSPFA.slide[1]) {
					MSPFA.slide[0]();
				} else {
					var tr = document.createElement("tr");
					var td = document.createElement("td");
					td.appendChild(document.createTextNode("This user's favorite adventures are private."));
					tr.appendChild(td);
					stories.appendChild(tr);
					MSPFA.slide[1] = true;
				}
			}
			stories.parentNode.parentNode.parentNode.style.display = "";
		}, function(status) {
			if(status == 404) {
				username.innerText = "User not found.";
			}
		}, true);
	} else if(location.pathname == "/random/") {
		location.replace("https://mspfa.com/random"); // riking: direct random to actual site
	} else if(location.pathname == "/donate/") {
		var donators = document.querySelector("#donators");
		MSPFA.request(0, {
			do: "achieved",
			a: 8
		}, function(users) {
			for(var i = 0; i < users.length; i++) {
				donators.appendChild(getUserCell(users[i]));
			}
		});
	} else if(location.pathname == "/feature/") {
		var vote = document.querySelector("#vote");
		MSPFA.slide[0] = function() {
			MSPFA.request(0, {
				do: "feature"
			}, function(f) {
				vote._f = f;
				var fss = f.s.length;
				while(fss) {
					var i = Math.floor(Math.random()*fss--);
					var t = f.s[fss];
					f.s[fss] = f.s[i];
					f.s[i] = t;
				}
				var stories = document.querySelector("#stories");
				if(f.s.length) {
					for(var i = 0; i < f.s.length; i++) {
						if(f.s[i].k > 1) {
							stories.appendChild(getStoryCell(f.s[i]));
						}
					}
				} else {
					var tr = document.createElement("tr");
					var td = document.createElement("td");
					td.appendChild(document.createTextNode("No adventures were found."));
					tr.appendChild(td);
					stories.appendChild(tr);
				}
				stories.parentNode.parentNode.parentNode.style.display = "";
				if(typeof MSPFA.slide[1] == "function") {
					MSPFA.slide[1]();
				}
			});
		};
		MSPFA.slide[0]();
		vote.addEventListener("submit", function(evt) {
			evt.preventDefault();
			if(idtoken) {
				MSPFA.request(0, {
					do: "story",
					s: vote.storyid.value
				}, function(story) {
					if(story.l) {
						MSPFA.dialog("Error", document.createTextNode("That adventure was deleted."), ["Okay"]);
					} else if(story.k) {
						MSPFA.dialog("Error", document.createTextNode("That adventure has already been featured."), ["Okay"]);
					} else if(story.e.indexOf(MSPFA.me.i) != -1) {
						MSPFA.dialog("Error", document.createTextNode("You mirror that adventure."), ["Okay"]);
					} else if(story.h != 2 && story.h != 3) {
						MSPFA.dialog("Error", document.createTextNode("That adventure is inactive."), ["Okay"]);
					} else if(story.p.length < 100) {
						MSPFA.dialog("Error", document.createTextNode("That adventure does not have at least 100 pages."), ["Okay"]);
					} else {
						var maxFavs = Math.round(50*(2+Math.min((Date.now()-story.d)/31536000000, 1)+Math.min((story.p.length-100)/900, 1)));
						if(story.f.length+story.g.length >= maxFavs) {
							MSPFA.dialog("Error", document.createTextNode("That adventure does not have less than " + maxFavs + " favorites."), ["Okay"]);
						} else if(!story.q && !/\[img(?:=(?:\d*?)x(?:\d*?))?\]([^"]*?)\[\/img\]/gi.test(story.p[0].b)) {
							var msg = document.createElement("span");
							msg.appendChild(document.createTextNode("That adventure does not have a thumbnail set."));
							msg.appendChild(document.createElement("br"));
							msg.appendChild(document.createTextNode("It is recommended that you "));
							var thumbm = document.createElement("a");
							thumbm.href = "/my/messages/new/";
							thumbm.innerText = "contact the mirrorer(s)";
							thumbm.addEventListener("click", function(evt) {
								evt.preventDefault();
								sessionStorage.m = JSON.stringify({
									t: story.e.join(",")
								});
								location.href = this.href;
							});
							msg.appendChild(thumbm);
							msg.appendChild(document.createTextNode(" and ask them to set a thumbnail."));
							MSPFA.dialog("Error", msg, ["Okay"]);
						} else {
							var msg = document.createElement("span");
							msg.appendChild(document.createTextNode("Are you sure you want to vote for "));
							var storyn = document.createElement("a");
							storyn.href = "/?s=" + story.i + "&p=1";
							storyn.innerText = story.n;
							msg.appendChild(storyn);
							msg.appendChild(document.createTextNode("?"));
							MSPFA.dialog("Confirm", msg, ["Yes", "No"], function(output) {
								if(output == "Yes") {
									MSPFA.request(1, {
										do: "vote",
										s: story.i
									}, function() {
										MSPFA.dialog("Vote", document.createTextNode("Your vote has been successfully cast!"), ["Okay"]);
									});
								}
							});
						}
					}
				}, function(status) {
					if(status == 404) {
						MSPFA.dialog("Error", document.createTextNode("An adventure with that ID does not exist."), ["Okay"]);
					}
				}, true);
			} else {
				MSPFA.dialog("Error", document.createTextNode("You must be logged in to vote."), ["Log in", "Cancel"], function(output) {
					if(output == "Log in") {
						location.href = "/login/?r=" + encodeURIComponent(location.href);
					}
				});
			}
		});
	} else if(location.pathname == "/tweet/") {
		var tweet = document.querySelector("#tweet");
		tweet.addEventListener("submit", function(evt) {
			evt.preventDefault();
			if(idtoken && MSPFA.me.p) {
				MSPFA.request(1, {
					do: "tweet",
					m: tweet.message.value
				}, function(link) {
					var a = document.createElement("a");
					a.href = link;
					a.innerText = link;
					MSPFA.dialog("Tweet", a, ["Okay"]);
				});
			} else {
				MSPFA.dialog("Error", document.createTextNode("You do not have permission to post to the MSPFA Twitter account unless you are a staff member."), ["Okay"]);
			}
		});
	}
})();
