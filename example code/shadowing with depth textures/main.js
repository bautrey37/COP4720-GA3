
require.config({
	baseUrl: "js"
});

require([
	"util/gl-context-helper",
	"util/camera",
	"skinned-model",
	"animation",
	"light",
	"util/gl-util",
	"util/gl-matrix-min",
	"js/util/game-shim.js",
	"js/util/Stats.js"
], function(GLContextHelper, Camera, SkinnedModel, Animation, Light, GLUtil) {
	"use strict";

	// Shader
	var cubeVS = [
		Light.SpotLight.vertexFunction,

		"attribute vec3 position;",
		"attribute vec2 texture;",
		"attribute vec3 normal;",
		
		"uniform mat4 viewMat;",
		"uniform mat4 modelMat;",
		"uniform mat3 normalMat;",
		"uniform mat4 projectionMat;",

		"varying vec2 vTexCoord;",
		"varying vec3 vNormal;",

		"void main(void) {",
		"   vec4 worldPosition =  modelMat * vec4(position, 1.0);",
		"   vTexCoord = texture;",
		"   vNormal = normal * normalMat;",
		"   setupLight(worldPosition.xyz);",
		"   setupShadow(worldPosition);",
		"   gl_Position = projectionMat * viewMat * worldPosition;",
		"}"
	].join("\n");

	var cubeFS = [
		"precision mediump float;",

		Light.SpotLight.fragmentFunction,

		"uniform vec3 ambient;",
		"uniform sampler2D diffuse;",

		"varying vec2 vTexCoord;",
		"varying vec3 vNormal;",

		"void main(void) {",
		"   vec3 lightValue = computeLight(vNormal, 0.5);",
		"   float shadowValue = computeShadow();",
		"   vec4 diffuseColor = texture2D(diffuse, vTexCoord);",
		"   vec3 finalColor = diffuseColor.rgb * ambient;",
		"   finalColor += diffuseColor.rgb * lightValue * shadowValue;",
		"   gl_FragColor = vec4(finalColor, diffuseColor.a);",
		"}"
	].join("\n");

	var Renderer = function (gl, canvas) {
		this.canvas = canvas;

		this.camera = new Camera.OrbitCamera(canvas);
		this.camera.maxDistance = 25;
		this.camera.minDistance = 2;
		this.camera.minOrbitX = 0;
		this.camera.distanceStep = 0.01;
		this.camera.setDistance(4);
		this.camera.setCenter([0, 0, 1]);

		this.light = new Light.SpotLight();
		this.light.radius = 10;
		this.light.target[2] = 1;
		
		this.projectionMat = mat4.create();

		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clearDepth(1.0);
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.CULL_FACE);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

		this._buildSkinnedModel(gl);
		this._buildCube(gl, 15, 15, 0.001);

		var self = this;
		this.cubeTexture = null;
		this.cubeTexture = GLUtil.loadTexture(gl, "root/texture/checker-floor.jpg");
		this.cubeShader = GLUtil.createProgram(gl, cubeVS, cubeFS);

		this.animateLightCheck = document.getElementById("animateLight");

		//this.depthExt = null;
		this.depthExt = GLUtil.getExtension(gl, "WEBGL_depth_texture");
		if(!this.depthExt) {
			var customControls = document.getElementById("customControls");
			customControls.classList.add("error");
			customControls.innerHTML = "WEBGL_depth_texture not supported by this browser";
		}

		// Even if the extension doen't exist this will create a "dummy depth" texture
		this.light.initShadowBuffer(gl, this.depthExt, 512);
	};

	Renderer.prototype.resize = function (gl, canvas) {
		gl.viewport(0, 0, canvas.width, canvas.height);
		mat4.perspective(45, canvas.width/canvas.height, 1.0, 256.0, this.projectionMat);
	};

	var modelMat = mat4.identity();
	var normalMat = mat3.identity();

	Renderer.prototype.draw = function (gl, timing) {
		var canvas = this.canvas;
		this.camera.update(timing.frameTime);

		if(this.animateLightCheck.checked) {
			this.light.position[0] = Math.cos(timing.elapsed / 2000.0) * 5.0;
			this.light.position[1] = Math.sin(timing.elapsed / 2000.0) * 5.0;
			this.light.position[2] = 3.0;
		}

		if(this.depthExt) {
			this.light.bindFramebuffer(gl);
			gl.cullFace(gl.FRONT);

			this.drawScene(gl, this.light.getViewMat(), this.light.getProjectionMat());

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.colorMask(true, true, true, true);
		}

		gl.cullFace(gl.BACK);
		
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		this.drawScene(gl, this.camera.getViewMat(), this.projectionMat, this.light);
		
		if(this.depthExt) {
			GLUtil.drawTexturedQuad(gl, this.light.depthTexture, canvas.width * 0.75, 0, canvas.width * 0.25, canvas.width * 0.25);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
	};

	Renderer.prototype.drawScene = function(gl, viewMat, projectionMat, light) {
		this.model.draw(gl, viewMat, projectionMat, light);

		var shader = this.cubeShader;
		gl.useProgram(shader.program);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertBuffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);

		gl.uniform3f(shader.uniform.ambient, 0.1, 0.1, 0.1);
		
		gl.uniformMatrix4fv(shader.uniform.viewMat, false, viewMat);
		gl.uniformMatrix4fv(shader.uniform.modelMat, false, modelMat);
		gl.uniformMatrix3fv(shader.uniform.normalMat, false, normalMat);
		gl.uniformMatrix4fv(shader.uniform.projectionMat, false, projectionMat);

		gl.enableVertexAttribArray(shader.attribute.position);
		gl.enableVertexAttribArray(shader.attribute.texture);
		gl.enableVertexAttribArray(shader.attribute.normal);
		gl.vertexAttribPointer(shader.attribute.position, 3, gl.FLOAT, false, 32, 0);
		gl.vertexAttribPointer(shader.attribute.texture, 2, gl.FLOAT, false, 32, 12);
		gl.vertexAttribPointer(shader.attribute.normal, 3, gl.FLOAT, false, 32, 20);
		
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(shader.uniform.diffuse, 0);
		gl.bindTexture(gl.TEXTURE_2D, this.cubeTexture);

		if(light) {
			light.bindUniforms(gl, shader.uniform, 1);
		}

		gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	Renderer.prototype._buildSkinnedModel = function(gl) {
		this.model = new SkinnedModel();
		this.model.load(gl, "root/models/main_player_lorez");

		var animationCheck = document.getElementById("animateModel");
		
		var self = this;
		this.anim = new Animation();
		this.anim.load("root/models/run_forward", function(anim) {
			// Simple hack to get the animation to play
			var frameId = 0;
			var frameTime = 1000 / anim.frameRate;
			setInterval(function() {
				if(self.model.complete && animationCheck.checked) {
					anim.evaluate(frameId % anim.frameCount, self.model);
					frameId++;
				}
			}, frameTime);
		});
	};

	Renderer.prototype._buildCube = function(gl, x, y, z) {
		// Set up the verticies and indices
		var cubeVerts = [
			//x  y   z   u  v  nx ny nz
			// Top
			-x,  y,  z,  0, 0,  0,  0,  1,
			 x,  y,  z,  1, 0,  0,  0,  1,
			-x, -y,  z,  0, 1,  0,  0,  1,
			 x, -y,  z,  1, 1,  0,  0,  1,

			// Bottom
			 x,  y, -z,  1, 0,  0,  0, -1,
			-x,  y, -z,  0, 0,  0,  0, -1,
			 x, -y, -z,  1, 1,  0,  0, -1,
			-x, -y, -z,  0, 1,  0,  0, -1,

			// Left
			-x,  y, -z,  1, 1, -1,  0,  0,
			-x,  y,  z,  1, 0, -1,  0,  0,
			-x, -y, -z,  0, 1, -1,  0,  0,
			-x, -y,  z,  0, 0, -1,  0,  0,

			// Right
			 x,  y,  z,  1, 0,  1,  0,  0,
			 x,  y, -z,  1, 1,  1,  0,  0,
			 x, -y,  z,  0, 0,  1,  0,  0,
			 x, -y, -z,  0, 1,  1,  0,  0,

			// Front
			-x,  y,  z,  0, 0,  0,  1,  0,
			 x,  y,  z,  1, 0,  0,  1,  0,
			-x,  y, -z,  0, 1,  0,  1,  0,
			 x,  y, -z,  1, 1,  0,  1,  0,

			// Back
			 x, -y,  z,  1, 0,  0, -1,  0,
			-x, -y,  z,  0, 0,  0, -1,  0,
			 x, -y, -z,  1, 1,  0, -1,  0,
			-x, -y, -z,  0, 1,  0, -1,  0
		];

		var cubeIndices = [
			0, 2, 1,
			2, 3, 1,

			4, 6, 5,
			6, 7, 5,

			8, 10, 9,
			10, 11, 9,

			12, 14, 13,
			14, 15, 13,

			16, 18, 17,
			18, 19, 17,

			20, 22, 21,
			22, 23, 21
		];

		this.cubeVertBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVertBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVerts), gl.STATIC_DRAW);

		this.cubeIndexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);
	};

	// Setup the canvas and GL context, initialize the scene 
	var canvas = document.getElementById("webgl-canvas");
	var contextHelper = new GLContextHelper(canvas, document.getElementById("content-frame"));
	var renderer = new Renderer(contextHelper.gl, canvas);

	var fullscreenBtn = document.getElementById("fullscreen");
	if(contextHelper.fullscreenSupported) {
		fullscreenBtn.addEventListener("click", function() {
			contextHelper.toggleFullscreen();
		});
	} else {
		fullscreenBtn.parentElement.removeChild(fullscreenBtn);
	}

	var stats = new Stats();
	document.getElementById("controls-container").appendChild(stats.domElement);
	
	// Get the render loop going
	contextHelper.start(renderer, stats);
});
