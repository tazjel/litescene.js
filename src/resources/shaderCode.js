
/**
* ShaderCode is a resource containing all the code associated to a shader
* It is used to define special ways to render scene objects, having full control of the rendering algorithm
* Having a special class helps to parse the data in advance and share it between different materials
* 
* @class ShaderCode
* @constructor
*/

function ShaderCode( code )
{
	this._code = null;

	this._functions = {};
	this._global_uniforms = {};
	this._code_parts = {};
	this._subfiles = {};
	this._compiled_shaders = {};

	this._shaderblock_flags_num = 0; //used to assign flags to dependencies
	this._shaderblock_flags = {};

	this._version = 0;

	if(code)
		this.code = code;
}

ShaderCode.help_url = "https://github.com/jagenjo/litescene.js/blob/master/guides/shaders.md";

//block types
ShaderCode.CODE = 1;
ShaderCode.PRAGMA = 2;

//pargma types
ShaderCode.INCLUDE = 1;
ShaderCode.SHADERBLOCK = 2;
ShaderCode.SNIPPET = 3;

Object.defineProperty( ShaderCode.prototype, "code", {
	enumerable: true,
	get: function() {
		return this._code;
	},
	set: function(v) {
		if(this._code == v)
			return;
		this._code = v;
		this.processCode();
	}
});

//parse the code
//store in a easy to use way
ShaderCode.prototype.processCode = function()
{
	var code = this._code;
	this._global_uniforms = {};
	this._code_parts = {};
	this._compiled_shaders = {};
	this._functions = {};
	this._shaderblock_flags_num = 0;
	this._shaderblock_flags = {};
	this._has_error = false;

	var subfiles = GL.processFileAtlas( this._code );
	this._subfiles = subfiles;

	var num_subfiles = 0;
	var init_code = null; 

	for(var i in subfiles)
	{
		var subfile_name = i;
		var subfile_data = subfiles[i];
		num_subfiles++;

		if(!subfile_name)
			continue;

		if(subfile_name == "js")
		{
			init_code = subfile_data;
			continue;
		}

		//used to declare uniforms without using javascript
		if(subfile_name == "uniforms")
		{
			var lines = subfile_data.split("/n");
			for(var j = 0; j < lines.length; ++j)
			{
				var line = lines[j].trim();
				var words = line.split(" ");
				var varname = words[0];
				var uniform_name = words[1];
				var property_type = words[2];
				var value = words[3];
				if( value !== undefined )
					value = LS.stringToValue(value);
				var options = null;
				var options_index = line.indexOf("{");
				if(options_index != -1)
					options = LS.stringToValue( line.substr(options_index) );
				this._global_uniforms[ varname ] = { name: varname, uniform: uniform_name, type: property_type, value: value, options: options };
			}
			continue;
		}

		var name = LS.ResourcesManager.removeExtension( subfile_name );
		var extension = LS.ResourcesManager.getExtension( subfile_name );

		if(extension == "vs" || extension == "fs")
		{
			var code_part = this._code_parts[name];
			if(!code_part)
				code_part = this._code_parts[name] = {};

			//parse data (extract pragmas and stuff)
			var glslcode = new GLSLCode( subfile_data );
			for(var j in glslcode.blocks)
			{
				var pragma_info = glslcode.blocks[j];
				if(!pragma_info || pragma_info.type != ShaderCode.PRAGMA)
					continue;
				//assign a flag position in case this block is enabled
				pragma_info.shader_block_flag = this._shaderblock_flags_num; 
				this._shaderblock_flags[ pragma_info.shader_block ] = pragma_info.shader_block_flag;
				this._shaderblock_flags_num += 1;
			}

			code_part[ extension ] = glslcode;
		}
	}

	//compile the shader before using it to ensure there is no errors
	var shader = this.getShader();
	if(!shader)
		return;

	//process init code
	if(init_code)
	{
		//clean code
		init_code = LS.ShaderCode.removeComments(init_code);

		if(init_code) //still some code? (we test it because if there is a single line of code the behaviour changes)
		{
			if(LS.catch_exceptions)
			{
				try
				{
					this._functions.init = new Function( init_code );
				}
				catch (err)
				{
					LS.dispatchCodeError( err, LScript.computeLineFromError(err), this );
				}
			}
			else
				this._functions.init = new Function( init_code );
		}
	}

	//check that all uniforms are correct
	this.validatePublicUniforms( shader );


	//to alert all the materials out there using this shader that they must update themselves.
	LEvent.trigger( LS.ShaderCode, "modified", this );
	this._version += 1;
}

//used when storing/retrieving the resource
ShaderCode.prototype.setData = function(v, skip_modified_flag)
{
	this.code = v;
	if(!skip_modified_flag)
		this._modified = true;
}

ShaderCode.prototype.getData = function()
{
	return this._code;
}

ShaderCode.prototype.getDataToStore = function()
{
	return this._code;
}

//compile the shader, cache and return
ShaderCode.prototype.getShader = function( render_mode, block_flags )
{
	if( this._has_error )
		return null;

	render_mode = render_mode || "default";
	block_flags = block_flags || 0;

	//search for a compiled version of the shader (by render_mode and block_flags)
	var shaders_map = this._compiled_shaders[ render_mode ];
	if(shaders_map)
	{
		var shader = shaders_map.get( block_flags );
		if(shader)
			return shader;
	}

	//search for the code
	var code = this._code_parts[ render_mode ];
	if(!code)
		return null;

	//vertex shader code
	var vs_code = null;
	if(render_mode == "fx")
		vs_code = GL.Shader.SCREEN_VERTEX_SHADER;
	else if( !code.vs )
		return null;
	else
		vs_code = code.vs.getFinalCode( GL.VERTEX_SHADER, block_flags );

	//fragment shader code
	if( !code.fs )
		return;
	var fs_code = code.fs.getFinalCode( GL.FRAGMENT_SHADER, block_flags );

	//no code or code includes something missing
	if(!vs_code || !fs_code) 
	{
		this._has_error = true;
		return null;
	}

	//compile the shader and return it
	var shader = this.compileShader( vs_code, fs_code );
	if(!shader)
		return null;

	//cache as render_mode,flags
	if( !this._compiled_shaders[ render_mode ] )
		this._compiled_shaders[ render_mode ] = new Map();
	this._compiled_shaders[ render_mode ].set( block_flags, shader );

	return shader;
}

ShaderCode.prototype.compileShader = function( vs_code, fs_code )
{
	if( this._has_error )
		return null;

	if(!LS.catch_exceptions)
		return new GL.Shader( vs_code, fs_code );
	else
	{
		try
		{
			return new GL.Shader( vs_code, fs_code );
		}
		catch(err)
		{
			this._has_error = true;
			LS.ShadersManager.dumpShaderError( this.filename, err, vs_code, fs_code );
			var error_info = GL.Shader.parseError( err, vs_code, fs_code );
			var line = error_info.line_number;
			var lines = this._code.split("\n");
			var code_line = -1;
			if(error_info.line_code)
			{
				var error_line_code = error_info.line_code.trim();
				for(var i = 0; i < lines.length; ++i)
					lines[i] = lines[i].trim();
				code_line = lines.indexOf( error_line_code ); //bug: what if this line is twice in the code?...
			}
			LS.dispatchCodeError( err, code_line, this, "shader" );
		}
	}
	return null;
}

ShaderCode.prototype.validatePublicUniforms = function( shader )
{
	if(!shader)
		throw("ShaderCode: Shader cannot be null");

	for( var i in this._global_uniforms )
	{
		var property_info = this._global_uniforms[i];
		var uniform_info = shader.uniformInfo[ property_info.uniform ];
		if(!uniform_info)
		{
			info.disabled = true;
			continue;
		}
	}
}


//makes this resource available 
ShaderCode.prototype.register = function()
{
	LS.ResourcesManager.registerResource( this.fullpath || this.filename, this );
}

//searches for materials using this ShaderCode and forces them to be updated (update the properties)
ShaderCode.prototype.applyToMaterials = function( scene )
{
	scene = scene || LS.GlobalScene;
	var filename = this.fullpath || this.filename;

	//materials in the resources
	for(var i in LS.ResourcesManager.resources)
	{
		var res = LS.ResourcesManager.resources[i];
		if( res.constructor !== LS.ShaderMaterial || res._shader != filename )
			continue;

		res.processShaderCode();
	}

	//embeded materials
	var nodes = scene.getNodes();
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.material && node.material.constructor === LS.ShaderMaterial && node.material._shader == filename )
			node.material.processShaderCode();
	}
}

//used in editor
ShaderCode.prototype.hasEditableText = function() { return true; }

ShaderCode.removeComments = function( code )
{
	// /^\s*[\r\n]/gm
	return code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');
}


LS.ShaderCode = ShaderCode;
LS.registerResourceClass( ShaderCode );

// now some shadercode examples that could be helpful

//Example code for a shader (used in editor) **************************************************
ShaderCode.examples = {};

ShaderCode.examples.fx = "\n\
\\fx.fs\n\
	precision highp float;\n\
	\n\
	uniform float u_time;\n\
	uniform vec4 u_viewport;\n\
	uniform sampler2D u_texture;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = texture2D( u_texture, v_coord );\n\
	}\n\
";

ShaderCode.examples.color = "\n\
\n\
\\js\n\
//define exported uniforms from the shader (name, uniform, widget)\n\
this.createUniform(\"Number\",\"u_number\",\"number\");\n\
this.createSampler(\"Texture\",\"u_texture\");\n\
\n\
\\default.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\default.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec3 u_ambient_light;\n\
\n\
uniform float u_number;\n\
uniform sampler2D u_texture;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	vec3 N = normalize( v_normal );\n\
	vec3 L = vec3( 0.577, 0.577, 0.577 );\n\
	vec4 color = u_material_color;\n\
	color.xyz *= max(0.0, dot(N,L) );\n\
	gl_FragColor = color;\n\
}\n\
\n\
";