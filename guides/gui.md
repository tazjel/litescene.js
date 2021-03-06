# Creating a GUI on top of your app #

Usually when people start using LiteScene they wonder if the library includes a GUI system to create the interface of their applications.
But they ignore that the web already has the best GUI system possible, and it is called HTML.

HTML is well documented, powerful, widely known, has lots of great features and it merges perfectly with the WebGL Canvas.

So when creating applications that require the user to interact with some widgets the fastest solution is to use regular HTML elements on top of the WebGL Canvas.

Maybe there is a slight performance drop due to the way browsers compose WebGL and HTML together, but it is the best way to ensure the GUI will fit well in a website.

## HTML and LiteScene

You are free to add any HTML element to the DOM at any moment, there are no limitations. The only problem come when you use the editor WebGLStudio.

When working with a scene in WebGLStudio you have to ensure that your HTML is not colliding with any of the editor, and that your HTML will be destroyed once the scene is reset.

To do so you must follow some rules that are explained in the next chapters.

## Creating HTML Elements ##

First, do not add HTML elements to the GUI till the application starts (when the onStart event is launched), otherwise there will be elements during the editing process that could interfere with the user.

## Attaching HTML to the DOM ##

Second, all DOM elements must be attached to the GUI root element, this way the system can remove all DOM elements if the scene is reset.

To get the GUI root element use the function ```LS.GUI.getRoot()```:

```javascript
var gui_root = LS.GUI.getRoot();
gui_root.innerHTML = "<button>click me</button>";
```

Be careful changing the style of the GUI root element. The GUI root element has the classname "litescene-gui", use that class to encapsulate your CSS properties to avoid collisions with other elements in the DOM.

## Mouse Events ##

The GUI root element is a div with 100% width and 100% height, positioned so that it overlays completly the canvas.

Because of that the div would get all the mouse events and no mouse events would reach the canvas.

To avoid that the GUI element has the ```style.pointerEvents``` set to ```none``` which means all the mouse events will be ignored by the element **and all its children**.

But sometimes we want to process mouse events in our widgets (clicking buttons, draging scrolls, etc).
If that is the case, you must set the ```style.pointerEvents``` to ```auto``` in the element that could get mouse events. You could do it by code or by CSS.

Keep that in mind when working with GUI elements.

## Creating GUI panels ##

Most of the time you would like to make just a floating div on top of the GUI to show some HTML information.
To help in those cases the easier solution is using the ```LS.GUI.createElement``` that behaves similar to ```document.createElement```, creating a tag of a given parameter, but it has some extra functionalities.

First the element will be attached automatically to the GUIElement so we dont have to do it.

Second the element pointerEvents will be set to auto, so we can add any normal HTML code and have the expected behaviour.

Thirth, it will be anchored to the corner of our canvas that we specify (if not anchor point is specified it will asume top-left).

Here is an example :

```javascript
var panel = LS.GUI.createElement("div","top-left");
panel.innerHTML = "<h3>HELLO!</h3>";
```

Valid anchors are "top-left","top-right","bottom-left" and "bottom-right";

## DOM events ##

From here if you want to bind events to the DOM elements you can do it as in any HTML website:

```javascript
var button = panel.querySelector("button");
button.addEventListener("click", my_function );
```

## Using HTML files ##

Creating HTML from the javascript code is very tedious and not very friendly.

Usually when creating HTML code you want to write it inside a normal HTML file. You can create a text file from the editor in WebGLStudio and add all the HTML code inside the file, retrieve the file when your application starts and attach it to the GUI element.

Here is one example:

```javascript
this.onStart = function()
{
  LS.ResourcesManagear.load("myfile.html", function(res){
    var gui_root = LS.GUI.getRoot();
    gui_root.innerHTML = res.data;
  });
}
```

Or you can store several HTML elements and attach the ones that you need by retrieving it as a HTML element and using selector querys:
```javascript
this.onStart = function()
{
  LS.ResourcesManagear.load("myfile.html", function(res){
    var gui_root = LS.GUI.getRoot();
    var html = res.getAsHTML();
    gui_root.appendChild( html.querySelector("#mypanel") );
  });
}
```
Or to go faster just attach them as you need:
```javascript
this.onStart = function()
{
  LS.ResourcesManagear.load("myfile.html", function(res){
    var html = res.getAsHTML();
    LS.GUI.attach( html.querySelector("#mypanel"), "top-left" );
  });
}
```

Or if you want to attach all the HTML to the GUI you can use ```LS.GUI.load("myfile.html", my_function)```:

```javascript
this.onStart = function()
{
  LS.GUI.load("myfile.html", function(html_root){
    html_root.querySelector("#mypanel").addEventListener("click", my_click_function);
  });
}
```

## Canvas GUIs ##

But if you dont want to use HTML and prefeer to create immediate GUIs by rendering manually to the WebGL canvas, you can use Canvas2DToWebGL, a library that allows to use regular Canvas2D calls inside the WebGL Canvas, this way you can easily render simple GUIs (more suited for non-interactive GUIs like HUDs).

Also one of the benefits of using Canvas2D is that you can render WebGL textures (even the ones generated by the engine) as part of the interace.

```javascript
this.onRenderGUI = function()
{
  var ctx = gl;
  ctx.start2D();
  ctx.fillStyle = "red";
  ctx.font = "20px Arial";
  ctx.fillText( "Hello", 100,100 );
  ctx.finish2D();
}
```

And if you want to check if the mouse is in a screen position you can use some of the ```LS.Input``` functions:

```javascript
this.onRenderGUI = function()
{
  var ctx = gl;
  ctx.start2D();
  if( LS.Input.Mouse.isInsideRect( 100, 100, 120,80, true ) )
  {
    ctx.canvas.style.cursor = "pointer";
	  ctx.fillColor = [0.5,0.5,0.7,0.75];
  }
  else
  {
		ctx.fillColor = [0.2,0.2,0.3,0.75];  
		ctx.canvas.style.cursor = "";
  }  
  ctx.fillText( "Hello", 100,100 );
  ctx.finish2D();
}
```

Check ```LS.Input``` guides for more info of how to handle input.
