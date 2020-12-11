g.web = {
	_draw: function() {},
	_on_message: function() {},
	_on_event: {},
	_canvas: null,
	_audio_ctx: null,

	gfx: {
		_initalize: function()
		{
			with (g.web)
			{
				if (_canvas == null)
				{
					console.error('Canvas element has not been set, WebGL cannot initialize');
					return false;
				}

				const gl = _canvas.getContext('webgl');
				const depth_ext = gl.getExtension('WEBGL_depth_texture');
				if (!depth_ext) {
					return alert('need WEBGL_depth_texture');
				}

				if (gl == null)
				{
					alert('Unable to initialize WebGL. Your browser or machine may not support it.');
					return false;
				}

				gl.clearColor(0.1, 0.1, 0.1, 1.0);
				gl.clearDepth(1.0);                 // Clear everything
				gl.depthFunc(gl.LEQUAL);            // Near things obscure far things
				gl.enable(gl.DEPTH_TEST);           // Enable depth testing
				gl.getExtension('OES_element_index_uint');
				gl.enable(gl.BLEND);
				gl.enable(gl.CULL_FACE);
				gl.cullFace(gl.FRONT);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

				window.gl = gl;

				const vertex_shader = `
				attribute vec3 a_position;
				attribute vec2 a_tex_coord;
				varying lowp vec2 v_tex_coord;
				varying lowp vec3 v_pos;
				void main (void) {
					gl_Position = vec4(v_pos = a_position, 1.0);
					v_tex_coord = a_tex_coord;
				}`;

				const frag_shader = `
				varying lowp vec2 v_tex_coord;
				varying lowp vec3 v_pos;
				uniform lowp float u_progress;
				void main (void) {
					if (0.1 > v_pos.y && v_pos.y > -0.1 && v_pos.x < ((u_progress * 2.0) - 1.0))
					{
						gl_FragColor = vec4(1.0);
					}
					else
					{
						gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
					}
				}`;

				g.web.gfx.shader.create('loading',
					vertex_shader,
					frag_shader
				);

		        g.web.assets['mesh/plane'] = g.web.gfx.mesh.plane();

				if (document.body.onresize) { document.body.onresize(); }

				return true;
			}
		},
		helpers: {
			pixel_to_canonical: function(pixel_coord) {
				const tr = [].translate([
					(2 * pixel_coord[0] / g.web.gfx.width()) - 1,
					-(2 * pixel_coord[1] / g.web.gfx.height()) + 1,
					1,
				]);//.mul(-1);
				return tr;
			}
		},
		width: function() { return g.web._canvas.width; },
		height: function() { return g.web._canvas.height; },
		aspect: function() { return g.web._canvas.width / g.web._canvas.height; },
		texture: {
			create: function(img)
			{
				const tex = gl.createTexture();
				gl.bindTexture(gl.TEXTURE_2D, tex);

				function is_power_of_2(n) { return (n != 0) && ((n & (n - 1))) == 0; }

				tex.width = img.width;
				tex.height = img.height;

				tex.depth = function() {
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.DEPTH_COMPONENT,
						img.width,
						img.height,
						0,
						gl.DEPTH_COMPONENT,
						gl.UNSIGNED_SHORT,
						null
					);

					return tex;
				};

				tex.color = function() {
					if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement)
					{
						gl.texImage2D(
							gl.TEXTURE_2D,
							0,
							gl.RGBA,
							gl.RGBA,
							gl.UNSIGNED_BYTE,
							img
						);
					}
					else
					{
						gl.texImage2D(
							gl.TEXTURE_2D,
							0,
							gl.RGBA,
							img.width,
							img.height,
							0,
							gl.RGBA,
							gl.UNSIGNED_BYTE,
							null
						);
					}

					return tex;
				};

				tex.pixelated = function() {
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					return tex;
				};

				tex.smooth = function() {
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					return tex;
				};

				tex.clamped = function() {
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					return tex;
				};

				tex.repeating = function() {
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
					return tex;
				};

				if (!is_power_of_2(tex.width)) { return tex.clamped(); }

				return tex;
			}
		},
		text: {
			create: function(width, height, font)
			{
				var canvas = document.createElement('canvas');
				document.body.appendChild(canvas);
				canvas.width = width || canvas.width;
				canvas.height = height || canvas.height;
				canvas.hidden = true;
				var ctx = canvas.getContext('2d');

				var texture = g.web.gfx.texture.create(canvas).color().clamped().smooth();
				ctx.font = font || '50px Arial';
				ctx.textBaseline = 'top';
				ctx.imageSmoothingEnabled = false;

				texture.canvas = canvas;
				texture.text = function(str, color)
				{
					ctx.setTransform(-1, 0, 0, -1, canvas.width, canvas.height)
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.fillStyle = color || "#000000ff";
					ctx.fillText(str, 0, 0);

					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						canvas
					);

					return texture;
				};

				return texture;
			}
		},
		render_target: {
			create: function(img) {
				const fbo = gl.createFramebuffer();
				gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

				fbo.color = function(tex)
				{
					fbo.color_attachment = tex;
					gl.bindTexture(gl.TEXTURE_2D, tex);
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
					return fbo;
				}

				fbo.depth = function(tex)
				{
					fbo.depth_attachment = tex;
					gl.bindTexture(gl.TEXTURE_2D, tex);
					gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
					return fbo;
				}

				fbo.shadow_map = function()
				{
					var depth_tex = g.web.gfx.texture.create(img).depth().clamped().smooth();
					return fbo.depth(depth_tex);
				}

				fbo.bind_as_target = ()=> {
					gl.viewport(0, 0, img.width, img.height);
					gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
				};

				fbo.unbind_as_target = ()=> {
					if (fbo.color_attachment)
					{
						gl.generateMipmap(gl.TEXTURE_2D);
					}

					gl.viewport(0, 0, g.web.gfx.width(), g.web.gfx.height());
					gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				};

				return fbo;
			}
		},
		shader: {
			create: function(name, vertex_src, fragment_src)
			{
				function load_shader(type, source)
				{
					const shader = gl.createShader(type);

					// Send the source to the shader object
					gl.shaderSource(shader, source);

					// Compile the shader program
					gl.compileShader(shader);

					// See if it compiled successfully
					if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
					{
						console.error('Error building ' + type);
						console.error(source);
						console.error('An error occurred compiling the shader: ' + gl.getShaderInfoLog(shader));
						console.error('-------------------------');

						gl.deleteShader(shader);
						return null;
					}

					return shader;
				}

				const vertex_shader = load_shader(gl.VERTEX_SHADER, vertex_src);
				const fragment_shader = load_shader(gl.FRAGMENT_SHADER, fragment_src);

				const program = gl.createProgram();
				gl.attachShader(program, vertex_shader);
				gl.attachShader(program, fragment_shader);
				gl.linkProgram(program);

				if (!gl.getProgramParameter(program, gl.LINK_STATUS))
				{
					console.error('Failed to link shader program: ' + gl.getProgramInfoLog(program));
					return null;
				}

				return g.web.gfx.shader[name] = program;
			}
		},
		mesh: {
			create: function(mesh_json)
			{
				var mesh = {
					indices: null,
					vertices: {},
					shader_configs: {},
					element_count: 0,

					buffer: function(buffer_name)
					{
						const mesh_ref = this;

						return {
							set_data: function(v)
							{
								let verts = v.as_Float32Array();
								gl.bindBuffer(gl.ARRAY_BUFFER, mesh_ref.vertices[buffer_name]);
								gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
								mesh_ref.element_count = verts.length;
							},
						};
					},

					using_shader: function(shader_name)
					{
						const mesh_ref = this;
						const shader = g.web.gfx.shader[shader_name];
						var tex_unit = 0;
						gl.useProgram(shader);

						return {
							with_attribute: function(description)
							{
								// TODO: add functionality to cache vertex attr pointers
								const buf = mesh_ref.vertices[description.buffer];

								if (buf === undefined) { console.error('Cannot use undefined buffer'); return; }
								gl.bindBuffer(gl.ARRAY_BUFFER, buf);
								const loc = gl.getAttribLocation(shader, description.name);
								if (loc < 0)
								{
									// console.error('Cannot find location for attribute "' + name + '" in shader "' + shader_name + '"');
									return this;
								}

								gl.vertexAttribPointer(
									loc,
									description.components || 1,
									description.type || gl.FLOAT,
									description.normalized || false,
									description.stride || 0,
									description.offset || 0
								);
								gl.enableVertexAttribArray(loc);

								return this;
							},
							with_camera: function(camera)
							{
								return this.set_uniform('u_proj').mat4(camera.projection())
										   .set_uniform('u_view').mat4(camera.view());
							},
							with_aspect_correct_2d: function(tex, transform)
							{
								transform = transform || [].I(4);
								const scale = [].mat_scale([
									2 * tex.width / g.web.gfx.width(),
									2 * tex.height / g.web.gfx.height(),
									1
								]);

								transform = scale.mat_mul(transform);

								return this.set_uniform('u_texture').texture(tex)
								           .set_uniform('u_proj').mat4([].I(4))
								           .set_uniform('u_view').mat4([].I(4))
								           .set_uniform('u_model').mat4(transform)
							},
							set_uniform: function(uni_name)
							{
								const shader_ref = this;
								const loc = gl.getUniformLocation(shader, uni_name);

								// if (loc < 0) { console.error('Could not find uniform "' + uni_name + '"'); }

								return {
									mat4: function(m)
									{
										const v = m.as_Float32Array();
										gl.uniformMatrix4fv(loc, false, v);
										return shader_ref;
									},
									vec3: function(v)
									{
										gl.uniform3fv(loc, v.as_Float32Array());
										return shader_ref;
									},
									vec4: function(v)
									{
										gl.uniform4fv(loc, v.as_Float32Array(), 1);
										return shader_ref;
									},
									float: function(s)
									{
										gl.uniform1f(loc, s);
										return shader_ref;
									},
									texture: function(tex)
									{
										gl.activeTexture(gl.TEXTURE0 + tex_unit);
										gl.bindTexture(gl.TEXTURE_2D, tex);
										gl.uniform1i(loc, tex_unit);
										++tex_unit;
										return shader_ref;
									},
								};
							},
							draw_tris: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.TRIANGLES,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.TRIANGLES, 0, mesh_ref.positions.length / 9);
								}

								return this;
							},
							draw_tri_strip: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.TRIANGLE_STRIP,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.TRIANGLE_STRIP, 0, mesh_ref.element_count / 3);
								}

								return this;
							},
							draw_tri_fan: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.TRIANGLE_FAN,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.TRIANGLE_FAN, 0, mesh_ref.element_count);
								}

								return this;
							},
							draw_lines: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.LINES,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.LINES, 0, mesh_ref.element_count);
								}

								return this;
							},
							draw_line_strip: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.LINES,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.LINE_STRIP, 0, mesh_ref.element_count / 3);
								}

								return this;
							},
							draw_points: function()
							{
								if (mesh_ref.indices)
								{
									gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh_ref.indices);
									gl.drawElements(
										gl.POINTS,
										mesh_ref.element_count,
										mesh_ref.index_type,
										0
									);
								}
								else
								{
									gl.drawArrays(gl.POINTS, 0, mesh_ref.element_count);
								}

								return this;
							}
						};
					},
				};

				if (!mesh_json) { return mesh; }

				if (mesh_json.positions)
				{
					mesh.vertices.positions = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices.positions);
					gl.bufferData(gl.ARRAY_BUFFER, mesh_json.positions.as_Float32Array(), gl.STATIC_DRAW);
				}

				if (mesh_json.texture_coords)
				{
					mesh.vertices.texture_coords = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices.texture_coords);
					gl.bufferData(gl.ARRAY_BUFFER, mesh_json.texture_coords.as_Float32Array(), gl.STATIC_DRAW);
				}

				if (mesh_json.colors)
				{
					mesh.vertices.colors = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices.colors);
					gl.bufferData(gl.ARRAY_BUFFER, mesh_json.colors.as_Float32Array(), gl.STATIC_DRAW);
				}

				if (mesh_json.normals)
				{
					mesh.vertices.normals = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices.normals);
					gl.bufferData(gl.ARRAY_BUFFER, mesh_json.normals.as_Float32Array(), gl.STATIC_DRAW);
				}

				if (mesh_json.indices)
				{
					mesh.indices = gl.createBuffer();
					gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
					if (mesh_json.indices.length > 0xffff)
					{
						gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh_json.indices.as_Int32Array(), gl.STATIC_DRAW);
						mesh.index_type = gl.UNSIGNED_INT;
					}
					else
					{
						gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh_json.indices.as_Int16Array(), gl.STATIC_DRAW);
						mesh.index_type = gl.UNSIGNED_SHORT;
					}

					mesh.element_count = mesh_json.indices.length;
				}
				else
				{
					mesh.element_count = mesh_json.positions.length;
				}

				return mesh;
			},
			plane: function()
			{
				return g.web.gfx.mesh.create({
					positions: [[-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]],
					normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]],
					texture_coords: [[1, 1], [0, 1], [0, 0], [1, 0]],
				});
			}
		},
		voxel: {
			create: function(voxel)
			{
				voxel.generate = function()
				{

					const vol = voxel.width * voxel.depth * voxel.height;
					this.mesh = {
						positions: [],
						normals: [],
						colors: [],
						texture_coords: [],
						indices: [],
						center_of_mass: [0, 0, 0],
					};
					var mesh = this.mesh;

					/*
							x -->

						z   3---2
						|   | / |
						v   |/  |
							0---1

						indices [ 0, 3, 2, 0, 2, 1 ]
					*/
					var ii = 0;
					var cell_count = 0;
					for (var wi = 0; wi < voxel.width; ++wi)
					for (var hi = 0; hi < voxel.height; ++hi)
					for (var di = 0; di < voxel.depth; ++di)
					{
						function has_neighbor_w(delta)
						{
							delta = wi + delta;
							if (delta < 0 || delta >= voxel.width) { return false; }
							return voxel.cells[delta][hi][di] > 0;
						}

						function has_neighbor_h(delta)
						{
							delta = hi + delta;
							if (delta < 0 || delta >= voxel.height) { return false; }
							return voxel.cells[wi][delta][di] > 0;
						}

						function has_neighbor_d(delta)
						{
							delta = di + delta;
							if (delta < 0 || delta >= voxel.depth) { return false; }
							return voxel.cells[wi][hi][delta] > 0;
						}

						const cell = voxel.cells[wi][hi][di];
						if (cell > 0)
						{
							const cell_top = has_neighbor_h(1), cell_bottom = has_neighbor_h(-1);
							const cell_left = has_neighbor_w(-1), cell_right = has_neighbor_w(1);
							const cell_front = has_neighbor_d(1), cell_back = has_neighbor_d(-1);

							const s = voxel.scale;
							const x = wi * s, y = hi * s, z = di * s;
							if (!cell_bottom) mesh.positions.push(x + 0, y + 0, z + 0, x + s, y + 0, z + 0, x + s, y + 0, z + s, x + 0, y + 0, z + s); // bottom 00-03
							if (!cell_left)   mesh.positions.push(x + 0, y + 0, z + 0, x + 0, y + s, z + 0, x + 0, y + s, z + s, x + 0, y + 0, z + s); // left   04-07
							if (!cell_front)  mesh.positions.push(x + 0, y + 0, z + s, x + 0, y + s, z + s, x + s, y + s, z + s, x + s, y + 0, z + s); // front  08-12
							if (!cell_right)  mesh.positions.push(x + s, y + 0, z + 0, x + s, y + s, z + 0, x + s, y + s, z + s, x + s, y + 0, z + s); // right  13-17
							if (!cell_back)   mesh.positions.push(x + 0, y + 0, z + 0, x + 0, y + s, z + 0, x + s, y + s, z + 0, x + s, y + 0, z + 0); // back   18-22
							if (!cell_top)    mesh.positions.push(x + 0, y + s, z + 0, x + s, y + s, z + 0, x + s, y + s, z + s, x + 0, y + s, z + s); // top    23-27

							if (!cell_bottom) mesh.texture_coords.push( 0.00, 1.00,  1/6, 1.00,  1/6, 0.00, 0.00, 0.00 ); // bottom
							if (!cell_left)   mesh.texture_coords.push(  4/6, 0.00,  4/6, 1.00,  3/6, 1.00,  3/6, 0.00 ); // left
							if (!cell_front)  mesh.texture_coords.push(  5/6, 0.00,  5/6, 1.00,  4/6, 1.00,  4/6, 0.00 ); // front
							if (!cell_right)  mesh.texture_coords.push(  1/6, 0.00,  1/6, 1.00,  2/6, 1.00,  2/6, 0.00 ); // right
							if (!cell_back)   mesh.texture_coords.push(  2/6, 0.00,  2/6, 1.00,  3/6, 1.00,  3/6, 0.00 ); // back
							if (!cell_top)    mesh.texture_coords.push(  5/6, 0.00, 1.00, 0.00, 1.00, 1.00,  5/6, 1.00 ); // top

							if (voxel.palette)
							{
								const color = voxel.palette[cell];
								const r = color[0], g = color[1], b = color[2]
								if (!cell_bottom) mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // bottom
								if (!cell_left)   mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // left
								if (!cell_front)  mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // front
								if (!cell_right)  mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // right
								if (!cell_back)   mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // back
								if (!cell_top)    mesh.colors.push(r, g, b, r, g, b, r, g, b, r, g, b); // top
							}

							if (!cell_bottom) mesh.normals.push( 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0 ); // bottom
							if (!cell_left)   mesh.normals.push(-1, 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0 ); // left
							if (!cell_front)  mesh.normals.push( 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ); // front
							if (!cell_right)  mesh.normals.push( 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0 ); // right
							if (!cell_back)   mesh.normals.push( 0, 0,-1, 0, 0,-1, 0, 0,-1, 0, 0,-1 ); // back
							if (!cell_top)    mesh.normals.push( 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0 ); // top

							if (!cell_bottom) { mesh.indices.push(ii + 2, ii + 3, ii + 0, ii + 1, ii + 2, ii + 0); ii += 4; }
							if (!cell_left)   { mesh.indices.push(ii + 0, ii + 3, ii + 2, ii + 0, ii + 2, ii + 1); ii += 4; }
							if (!cell_front)  { mesh.indices.push(ii + 0, ii + 3, ii + 2, ii + 0, ii + 2, ii + 1); ii += 4; }
							if (!cell_right)  { mesh.indices.push(ii + 2, ii + 3, ii + 0, ii + 1, ii + 2, ii + 0); ii += 4; }
							if (!cell_back)   { mesh.indices.push(ii + 2, ii + 3, ii + 0, ii + 1, ii + 2, ii + 0); ii += 4; }
							if (!cell_top)    { mesh.indices.push(ii + 0, ii + 3, ii + 2, ii + 0, ii + 2, ii + 1); ii += 4; }

							mesh.center_of_mass[0] += x;
							mesh.center_of_mass[1] += y;
							mesh.center_of_mass[2] += z;
							cell_count++;
						}
					}

					mesh.center_of_mass = mesh.center_of_mass.mul(1 / cell_count);

					for (var pi = 0; pi < mesh.positions.length; pi += 3)
					{
						mesh.positions[pi + 0] = mesh.positions[pi + 0] - mesh.center_of_mass[0];
						mesh.positions[pi + 1] = mesh.positions[pi + 1] - mesh.center_of_mass[1];
						mesh.positions[pi + 2] = mesh.positions[pi + 2] - mesh.center_of_mass[2];
					}
				};

				voxel.generate();
				var gl_mesh = g.web.gfx.mesh.create(voxel.mesh);

				for (var key in gl_mesh)
				{
					voxel[key] = gl_mesh[key];
				}

				return voxel;
			}
		},
		sprite: {
			create: function(aesprite_json)
			{
				const img_w = aesprite_json.meta.size.w;
				const img_h = aesprite_json.meta.size.h;
				var frames = [];
				var tags = {};

				for_each(aesprite_json.meta.frameTags, (frame_tag) => {
					tags[frame_tag.name] = [];
					switch (frame_tag.direction)
					{
						case 'forward':
							for (var i = frame_tag.from; i <= frame_tag.to; ++i)
							{
								tags[frame_tag.name].push(i);
							}
							break;
						case 'pingpong':
							for (var i = frame_tag.from; i <= frame_tag.to; ++i)
							{
								tags[frame_tag.name].push(i);
							}
							for (var i = frame_tag.to; i >= frame_tag.from; --i)
							{
								tags[frame_tag.name].push(i);
							}
							break;
					}

					tag = tags[frame_tag.name];
				});

				for_each(aesprite_json.frames, (frame_meta) => {
					const frame = frame_meta.frame;
					frames.push({
						x: frame.x / img_w,
						y: frame.y / img_h,
						w: frame.w / img_w,
						h: frame.h / img_h,
						sec: frame_meta.duration / 1000
					});
				});

				return function() {
					this.frame_idx = 0;
					this.frame_duration = frames[0].sec;
					this.paused = false;
					this.speed = 1;
					this.tag = tag;
					this.tags = tags;
					this.queue = [];

					this.current_frame = function()
					{
						return frames[this.tag[this.frame_idx]];
					}

					this.pause = function(pause) { this.paused = pause; }

					this.tick = function(dt)
					{
						dt *= this.speed;

						if(!this.paused)
						while (dt > 0)
						{
							const prev_dur = this.frame_duration;
							this.frame_duration -= dt;

							if (this.frame_duration <= 0)
							{
								this.frame_idx++;
								if (this.frame_idx >= this.tag.length)
								{
									if (this.queue.length > 0)
									{
										this.tag = this.queue.pop();
									}

									this.frame_idx = 0;
								}
								this.frame_duration = this.current_frame().sec;
							}

							dt -= prev_dur;
						}
					};

					this.set = function(tag)
					{
						this.frame_idx = 0;
						this.tag = this.tags[tag];
					}

					this.origin = function()
					{
						return [ this.current_frame().x,  this.current_frame().y ];
					};

					this.size = function()
					{
						return [ this.current_frame().w,  this.current_frame().h ];
					};
				};
			}
		}
	},
	snd: {
		_initalize: function()
		{
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			g.web._audio_ctx = new AudioContext();
		},
		listener:
		{
			from_camera: function(cam)
			{
				const f = cam.forward(), u = cam.up();
				const p = cam.position();
				g.web._audio_ctx.listener.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
				g.web._audio_ctx.listener.setPosition(p[0], p[1], p[2]);
			}
		}
	},
	assets: {
		processors: {},
		load: function(asset_arr, on_finish)
		{
			var req_frame = window.requestAnimationFrame       ||
			    window.webkitRequestAnimationFrame ||
			    window.mozRequestAnimationFrame    ||
			    window.oRequestAnimationFrame      ||
			    window.msRequestAnimationFrame;
			var count = asset_arr.length;
			var loaded = 0;

			function load_resource(path)
			{
				return fetch(path).then(function(res)
				{
					console.log('Loading: ' + path);
					const type = res.headers.get('content-type');
					const type_stem = type.split('/')[0];
					var bytes_to_read = parseInt(res.headers.get('content-length'));

					const fields = path.split('.');
					const processors = fields.slice(1);
					const name = fields[0];

					function process_asset(asset)
					{
						for (var i = 0; i < processors.length; i++)
						{
							const proc_name = processors[i];
							if (proc_name in g.web.assets.processors)
							try
							{
								asset = g.web.assets.processors[proc_name](asset);
							}
							catch (error)
							{
								console.error('Error: processing "{}" with "{}" failed - {}'.format([path, proc_name, error]));
							}
						}

						return asset;
					}

					switch (type_stem)
					{
						case 'image':
						{
							var img = new Image();
							img.src = res.url;
							g.web.assets[path] = img;
							console.log('Finished: ' + path);

							// create webgl texture automatically
							img.onload = function()
							{
								img = process_asset(img);

								const tex_name = name.replace('imgs', 'tex');

								var tex = g.web.gfx.texture.create(img).color().smooth().repeating();

								if (processors.indexOf('pixelated') >= 0) { tex = tex.pixelated(); }
								if (processors.indexOf('smooth') >= 0) { tex = tex.smooth(); }
								if (processors.indexOf('repeating') >= 0) { tex = tex.repeating(); }
								if (processors.indexOf('clamped') >= 0) { tex = tex.clamped(); }
								g.web.assets[tex_name] = tex;
							};
						} break;

						case 'audio':
						{
							const sound_name = name.replace('sounds', 'sound');

							g.web.assets[sound_name] = function (pos)
							{
								var ctx = g.web._audio_ctx;
								this.audio = new Audio(res.url);
								this.track = ctx.createMediaElementSource(this.audio);
								this.panner = ctx.createPanner();
								this.gain_node = ctx.createGain();
								this.gain_node.gain.value = 2;

								if (processors.indexOf('looping') >= 0) { this.audio.loop = true; }

								this.track.connect(this.gain_node).connect(this.panner).connect(ctx.destination);
								this.panner.setPosition(pos[0], pos[1], pos[2]);
								this.speed = function(speed)
								{
									if (this.audio.playbackRate == speed) { return; }
									this.audio.playbackRate = speed;
								}
								this.is_playing = function() { return !this.audio.paused && !this.audio.ended; }
								this.loop = function(loop) { this.audio.loop = loop; return this; }
								this.position = function(pos) { this.panner.setPosition(pos[0], pos[1], pos[2]); return this; }
								this.play = function()        { this.audio.play(); return this; }
								this.pause = function()       { this.audio.pause(); return this; }
								this.gain = function(g)       { this.gain_node.gain.value = g; return this; }
							}
							console.log('Finished: ' + path);
						} break;
					}

					// specific mime types
					switch (type)
					{
						case 'application/json':
						case 'application/json; charset=UTF-8':
						{
							g.web.assets[path] = '';
							return res.json().then(function (json) {

								g.web.assets[path] = process_asset(json);

								if (path.indexOf('meshes') > -1)
								{
									const mesh_name = path.replace('meshes', 'mesh').replace('.json', '');
									g.web.assets[mesh_name] = g.web.gfx.mesh.create(g.web.assets[path]);
								}
								else if (path.indexOf('voxels') > -1)
								{
									const mesh_name = path.replace('voxels', 'voxel').replace('.json', '');
									g.web.assets[mesh_name] = g.web.gfx.voxel.create(g.voxel.create(g.web.assets[path]));
								}
								else if (path.indexOf('animations') > -1)
								{
									const animation_name = path.replace('animations', 'animation').replace('.json', '');
									g.web.assets[animation_name] = g.web.gfx.sprite.create(g.web.assets[path]);
								}

								console.log('Finished OK: ' + path);
							});
						} break;

						case 'text/plain':
						case 'application/octet-stream':
						{
							g.web.assets[path] = '';
							return res.body.getReader().read().then(function(res)
							{
								console.log('Loading: ' + path + ' bytes remaining: ' + bytes_to_read);
								g.web.assets[path] += (new TextDecoder()).decode(res.value);
							});
						} break;
					}
				});
			}

			var promises = [];
			// for (var i = 0; i < asset_arr.length; i++)
			// {
			// 	promises.push(load_resource(asset_arr[i]));
			// }
			function load(idx)
			{
				if (idx >= asset_arr.length) { return this; }
				return load_resource(asset_arr[idx]).then(function(){
					//function draw()
					//req_frame(draw);
					// draw();
					loaded += 1;
					return load(idx + 1);
				})
			}

			var started = false;
			var ticker = setInterval(function(){
				gl.clearColor(0, 0, 0, 1);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
				g.web.assets['mesh/plane'].using_shader('loading')
				                          .with_attribute({name:'a_position', buffer: 'positions', components: 3})
				                          .with_attribute({name:'a_tex_coord', buffer: 'texture_coords', components: 2})
				                          .set_uniform('u_progress').float(loaded/count)
				                          .draw_tri_fan();
				if (!started)
				{
					started = true;
					load(0).then(function(){
						clearInterval(ticker);
						on_finish();
					});
				}
			}, 10);

			// Promise.all(promises).then(function(values)
			// {
			//     on_finish();
			// });
			// setTimeout(function(){
			// load(0).then(function(){ clearInterval(ticker); on_finish(); })
			// });
		},
	},

	pointer:
	{
		_last : [ 0, 0 ],

		on_move: function(on_move_func)
		{
			g.web._canvas.addEventListener("touchmove", function(e)
			{
				const t = e.touches[0];
				e.preventDefault();

				if (g.web.pointer._last)
				{
					t.movementX = t.clientX - g.web.pointer._last[0];
					t.movementY = t.clientY - g.web.pointer._last[1];
				}

				if (g.web._audio_ctx.state === 'suspended')
				{
					g.web._audio_ctx.resume();
				}

				on_move_func(t);
				g.web.pointer._last = [ t.clientX, t.clientY ];
			}, false);

			g.web._canvas.addEventListener("mousemove", function(e)
			{
				e.preventDefault();
				g.web.pointer._last = [ e.clientX, e.clientY ];

				if (g.web._audio_ctx.state === 'suspended')
				{
					g.web._audio_ctx.resume();
				}

				on_move_func(e);
			}, false);

			return this;
		},

		on_scroll: function(on_scoll_func)
		{
			g.web._canvas.addEventListener("scroll", function(e)
			{
				on_scoll_func(e);
			});
		},

		on_pointer_lock_change: function(on_pointer_lock_func)
		{
			if ("onpointerlockchange" in document)
			{
				document.addEventListener('pointerlockchange', function(e)
				{
					on_pointer_lock_func(e);
				}, false);
			}
			else if ("onmozpointerlockchange" in document)
			{
				document.addEventListener('mozpointerlockchange', function(e)
				{
					on_pointer_lock_func(e);
				}, false);
			}
		},

		cast_ray: function(view)
		{
			const s = [ g.web.gfx.width(), g.web.gfx.height() ];
			const h = s.mul(0.5);
			const p = g.web.pointer._last.sub(h).div(h);
			const d = [ p[0], p[1], 1, 1 ];

			const dp = view.mat_mul(d);

			// console.log(dp);
		},

		on_press: function(on_press_func)
		{
			g.web._canvas.ontouchstart = function(e)
			{
				const t = e.touches[0];
				g.web.pointer._last = [ t.clientX, t.clientY ];
				on_press_func(e);
			};

			g.web._canvas.onmousedown = function(e)
			{
				const t = e;
				g.web.pointer._last = [ t.clientX, t.clientY ];
				on_press_func(e);
			};
		},

		on_release: function(on_release_func)
		{
			g.web._canvas.ontouchend = g.web._canvas.ontouchcancel = g.web._canvas.onmouseup = function()
			{
				on_release_func();
			};
		}
	},

	key:
	{
		_initalized: false,
		_initalize: function()
		{
			if (g.web.key._initalized) { return; }

			document.onkeydown = function(key)
			{
				g.web.key._map[key.key.toLowerCase()] = true;

				for (var i = g.web.key._key_down_handlers.length; i--;)
				{
					g.web.key._key_down_handlers[i](key.key.toLowerCase());
				}
			};

			document.onkeyup = function(key)
			{
				g.web.key._map[key.key.toLowerCase()] = false;

				for (var i = g.web.key._key_up_handlers.length; i--;)
				{
					g.web.key._key_up_handlers[i](key.key.toLowerCase());
				}
			};

			g.web.key._initalized = true;
		},
		_map: {},
		_key_down_handlers: [],
		_key_up_handlers: [],
		is_pressed: function(key)
		{
			g.web.key._initalize();

			return g.web.key._map[key] || false;
		},
		is_down: function(cb) { g.web.key._initalize(); g.web.key._key_down_handlers.push(cb); },
		is_up: function(cb) { g.web.key._initalize(); g.web.key._key_up_handlers.push(cb); }
	},

	on_message: function(f) { g.web._on_message = f; return this; },

	on: function(event)
	{
		return { 'do': function(cb) { g.web._on_event[event] = cb; }}
	},

	signal: function(name, msg)
	{
		g.web._socket.emit(name, msg);
	},

	canvas: function(dom_element, opts)
	{
		opts = opts || {};
		g.web._canvas = dom_element;

		if (opts.fill)
		{
			document.body.onresize = function(e) {
				g.web._canvas.width = document.body.clientWidth;
				g.web._canvas.height = document.body.clientHeight;
				gl.viewport(0, 0, document.body.clientWidth, document.body.clientHeight);
			};
		}
		else if (!opts.fixed_size)
		{
			document.body.onresize = function(e) {
				g.web._canvas.width = g.web._canvas.clientWidth;
				g.web._canvas.height = g.web._canvas.clientHeight;
				gl.viewport(0, 0, g.web._canvas.clientWidth, g.web._canvas.clientHeight);
			};
		}

		g.web._canvas.requestPointerLock = g.web._canvas.requestPointerLock ||
										   g.web._canvas.mozRequestPointerLock ||
										   function(){};

		document.exitPointerLock = document.exitPointerLock ||
								   document.mozExitPointerLock ||
								   function(){};

		g.web._canvas.requestPointerLock();

		return this;
	},

	draw: function(f) { g.web._draw = f; return this; }

};
