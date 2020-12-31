const g = {
	_initalize: function() {},
	_update: function() {},
	is_running: true,

	timer: function(){
		this._last = (new Date()).getTime();
		this._start = (new Date()).getTime();

		this.tick = function()
		{
			var t = (new Date()).getTime();
			var dt = t - this._last;
			this._last = t;
			return dt / 1000;
		};

		this.total = function()
		{
			return (new Date()).getTime() - this._start;
		};
	},

	initialize: function(f) { g._initialize = f; return this; },

	update: function(f) { g._update = f; return this; },

	canvas: function(dom_element) { g._canvas = dom_element; return this; },

	start: function(opts)
	{
		var req_frame = window.requestAnimationFrame       ||
		                window.webkitRequestAnimationFrame ||
		                window.mozRequestAnimationFrame    ||
		                window.oRequestAnimationFrame      ||
		                window.msRequestAnimationFrame;
		var step_timer = new g.timer();

		// if we are a browser, setup socket.io to connect to the server
		if (g.web)
		{
			g.web._socket = io();
			g.web._socket.binaryType = 'arraybuffer';
			g.web._socket.on('message', g.web._on_message);

			for (var e in g.web._on_event)
			{
				g.web._socket.on(e, g.web._on_event[e]);
			}

			g.web.socket = function() { return g.web._socket; }
            if (!g.web.gfx._initalize()) { return; }
            g.web.snd._initalize();
		}

 		// custom initialization
		if (!g._initialize())
		{
			console.error('initialize_func(): returned false.');
			return;
		}

		// update, and render if appropriate
		var frames = 0;
		var time_since_sec = 0;
		var update = function() {
			var dt = step_timer.tick();

			if (g.is_running && (dt > 0 && dt < 1) && isFinite(dt))
			{
				g._update(dt);

				if (g.web)
				{
					g.web._draw(dt);
				}
			}

			if (g.web) { req_frame(update); }

			if (opts.print_fps)
			{
				if (time_since_sec >= 1)
				{
					console.log(frames + ' fps');
					frames = 0;
					time_since_sec = 0;
				}
				time_since_sec += dt;
				frames++;
			}
		};

		if (g.web) { req_frame(update); }
	},

	voxel: {
		create: function(voxel_data)
		{
			// process data into uniform type here.
			var palette = null;
			var locations = [];
			const RGBA = voxel_data.RGBA.slice();

			// grab the palette if it exists
			if (voxel_data.palette)
			{
				palette = new Array(voxel_data.palette.length / 4);
				for (var pi = 0; pi < voxel_data.palette.length; pi += 4)
				{
					palette[pi >> 2] = [voxel_data.palette[pi + 0] / 255, voxel_data.palette[pi + 1] / 255, voxel_data.palette[pi + 2] / 255];//, palette[pi].a / 255];
				}
			}

			// convert to uniform data storage
			if (voxel_data.SIZE)
			{
				var cells = new Array(voxel_data.SIZE.x);
				for (var xi = voxel_data.SIZE.x; xi--;)
				{
					cells[xi] = new Array(voxel_data.SIZE.z);
					for (var yi = voxel_data.SIZE.z; yi--;)
					{
						cells[xi][yi] = new Array(voxel_data.SIZE.y);
						cells[xi][yi].fill(0);
					}
				}

				for (var vi = voxel_data.XYZI.length; vi--;)
				{
					const set = voxel_data.XYZI[vi];
					cells[set.x][set.z][set.y] = set.c - 1;
				}

				if (voxel_data.RGBA && typeof(voxel_data.RGBA[0]) == 'object')
				{
					palette = voxel_data.RGBA;
					for (var pi = palette.length; pi--;)
					{
						if (!palette[pi]) { continue; }
						palette[pi] = [palette[pi].r / 255, palette[pi].g / 255, palette[pi].b / 255];//, palette[pi].a / 255];
					}
				}

				voxel_data = {
					width: voxel_data.SIZE.x,
					height: voxel_data.SIZE.z,
					depth: voxel_data.SIZE.y,
					scale: voxel_data.scale || 1,
					palette: palette,
					cells: cells
				};
			}

			const w = voxel_data.width;
			const h = voxel_data.height;
			const d = voxel_data.depth;
			const s = voxel_data.scale || 1;
			var cells = voxel_data.cells;
			var center_of_mass = [0, 0, 0];

			return {
				width: w,
				height: h,
				depth: d,
				scale: s,
				palette: palette,
				cells: cells,
				center_of_mass: function(force)
				{
					if (force || center_of_mass.sum() == 0)
					{
						center_of_mass = [0, 0, 0];
						var cell_count = 0;
						for (var x = w; x--;)
						for (var y = h; y--;)
						for (var z = d; z--;)
						{
							if (cells[x][y][z] > 0)
							{
								center_of_mass = center_of_mass.add([x, y, z]);
								cell_count++;
							}
						}

						center_of_mass = center_of_mass.mul(s / cell_count);
					}

					return center_of_mass;
				},
				intersection: function(pos, dir)
				{
					pos = pos.mul(1/s);
					dir = dir.mul(1/s);
					var fp = pos.floor(), cp = pos.ceil();

					let itrs = Math.ceil(dir.len()) * 5;
					for (var p = 0; p < itrs; p++)
					{
						const pd = pos.add(dir.mul(p / itrs));
						const pd_f = pd.floor();
						const pd_c = pd.ceil();

						if (pd_f[0] < 0 || pd_f[0] >= w) { return false; }
						if (pd_f[1] < 0 || pd_f[1] >= h) { return false; }
						if (pd_f[2] < 0 || pd_f[2] >= d) { return false; }

						if (cells[pd_f[0]][pd_f[1]][pd_f[2]] > 0)
						{
							var norm = fp.sub(pd_f);
							if (norm.dot(norm) > 0) { norm = norm.norm(); }

							var pen = [0, 0, 0];

							for (var i = 0; i < 3; i++)
							{
								if (dir[i] >= 0) { pen[i] = pd[i] - pd_f[i]; }
								else             { pen[i] = pd[i] - pd_c[i]; }
							}

							return {
								point: pd,
								normal: norm,
								penetration: pen
							};
						}
					}

					return false;
				},
				sample: function(pos)
				{
					pos = pos.mul(1/s);
					var fp = pos.floor();

					if (fp[0] < 0 || fp[0] >= w) { return undefined; }
					if (fp[1] < 0 || fp[1] >= h) { return undefined; }
					if (fp[2] < 0 || fp[2] >= d) { return undefined; }

					return {
						point: fp.mul(s),
						cell: cells[fp[0]][fp[1]][fp[2]]
					}
				},
				each_voxel: function(cb)
				{
					for (var x = 0; x < w; x++)
					for (var y = 0; y < h; y++)
					for (var z = 0; z < d; z++)
					{
						if (cells[x][y][z])
						{
							if (cb(x, y, z)) { return; }
						}
					}
				},
				downsample: function(factor)
				{
					var vox_data = {
						SIZE: {
							x: w / factor,
							y: d / factor,
							z: h / factor,
						},
						XYZI: [],
						RGBA: RGBA,
						scale: voxel_data.scale * factor
						// palette: palette
					};

					for (var ds_x = 0; ds_x < vox_data.SIZE.x; ds_x++)
					for (var ds_y = 0; ds_y < vox_data.SIZE.z; ds_y++)
					for (var ds_z = 0; ds_z < vox_data.SIZE.y; ds_z++)
					{

						// find the mode of this downsampled block
						var filled = 0;
						var empty = 0;
						var last_id = 0;
						for (var x = ds_x * factor; x < (ds_x + 1) * factor; x++)
						for (var y = ds_y * factor; y < (ds_y + 1) * factor; y++)
						for (var z = ds_z * factor; z < (ds_z + 1) * factor; z++)
						{
							const id = cells[x][y][z];
							if (id <= 0) { empty += 1; }
							else
							{
								filled += 1;
								last_id = id;
							}
						}

						var mode = 0;
						if (filled > empty / 2)
						{
							mode = last_id;
						}

						if (mode)
						vox_data.XYZI.push({
							x: ds_x,
							y: ds_z,
							z: ds_y,
							c: mode + 1
						});
					}

					return g.voxel.create(vox_data);
				}
			};
		}
	},

	animation: {
		create: function(json)
		{
			var frames = [];
			var tags = {};

			for_each(json.meta.frameTags, (frame_tag) => {
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

			for_each(json.frames, (frame_meta) => {
				const frame = frame_meta.frame;
				frames.push({
					asset: frame_meta.asset,
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
			};
		}
	},

	camera: {
		create: function()
		{
			var _q = [0,0,0,1];
			var _view = [].I(4);
			var _proj = [].I(4);
			var _pos = [0,0,0];
			var _forward = [0,0,-1];
			var _up = [0,1,0];
			var _left = [-1,0,0];
			var is_listener = true;

			var cam = {
				look_at: function(position, subject, up)
				{
					if (position && subject && up)
					{
						_pos = position;
						_forward = position.sub(subject).norm();
						_up = up.norm();
						_view = [].view(_pos, _forward, _up);
						_left = _q.quat_rotate_vector([-1, 0, 0]);
					}

					return _view;
				},
				orientation: function(q)
				{
					if (q) { _q = q; }

					_up = _q.quat_rotate_vector([0, 1, 0]);
					_forward = _q.quat_rotate_vector([0, 0, -1]);
					_left = _q.quat_rotate_vector([-1, 0, 0]);

					return _q;
				},
				tilt: function(d_yaw, d_pitch, d_roll)
				{
					d_yaw = d_yaw || 0;
					d_pitch = d_pitch || 0;
					d_roll = d_roll || 0;

					const dqx = [].quat_rotation([1, 0, 0], d_yaw);
					const dqy = [].quat_rotation([0, 1, 0], d_pitch);
					const dqz = [].quat_rotation([0, 0, 1], d_roll);
					const dq = dqx.quat_mul(dqy).quat_mul(dqz);
					_q = _q.quat_mul(dq);

					_up = _q.quat_rotate_vector([0, 1, 0]);
					_forward = _q.quat_rotate_vector([0, 0, -1]);
					_left = _q.quat_rotate_vector([-1, 0, 0]);

					this.view(_pos, _forward, _up);
				},
				position: function(p)
				{
					if (p)
					{
						_pos = p;
						this.view(_pos, _forward, _up);
					}

					return _pos;
				},
				up: function(u)
				{
					if (u)
					{
						_up = u;
						this.view(_pos, _forward, _up);
					}

					return _up;
				},
				left: function()
				{
					return _left;
				},
				forward: function(f)
				{
					if (f)
					{
						_forward = f;
						this.view(_pos, _forward, _up);
					}

					return _forward;
				},
				projection: function() { return _proj; },
				perspective: function(fov, near, far)
				{
					fov = fov || Math.PI / 2;
					near = near || 0.1;
					far = far || 1000;

					_proj = [].perspective(fov, g.web.gfx.aspect(), near, far);

					return this;
				},
				orthographic: function(width, height, near, far)
				{
					const a = g.web.gfx.aspect();
					near = near || 0.1;
					far = far || 500;
					_proj = [].orthographic(width/2, -width/2, height/2, -height/2, near, far);

					return this;
				}
			};

			cam.view = (position, forward, up) => {
				if (position && forward && up)
				{
					_pos = position;
					_forward = forward.norm();
					_up = up.norm();
					_left = _up.cross(_forward);
					_up = _forward.cross(_left);
					_view = [].view(_pos, _forward, _up);
					// _left = _q.quat_rotate_vector([-1, 0, 0]);

					if (is_listener && g.web && g.web._audio_ctx) { g.web.snd.listener.from_camera(cam); }
				}

				return _view;
			};

			return cam;
		},
		fps: function(opts)
		{
			var cam = g.camera.create();

			cam.mass = 1.0;
			cam.force = 1.0;
			cam.friction = 1.0;
			cam.forces = [];
			cam.max_pitch = Math.PI / 2;
			cam.min_pitch = -Math.PI / 2;

			var pitch = 0;
			var yaw = 0;
			var velocity = [0, 0, 0];
			var last_collisions = [];
			var coll_offsets = [];
			var coll_dirs = [];

			if (opts && opts.collision_rep)
			{

			}
			else
			{
				// default cube collision rep
				for (var i = -1; i <= 1; i++)
				{
					if (0 == i) { continue; }
					coll_dirs.push([i, 0, 0].mul(0.125));
					coll_dirs.push([0, i, 0].mul(1));
					coll_dirs.push([0, 0, i].mul(0.125));
				}

				for (var x = -1; x <= 1; x++)
				for (var y = -1; y <= 1; y++)
				for (var z = -1; z <= 1; z++)
				{
					if (x + y + z == 0) { continue; }
					coll_offsets.push([x, y, z].mul(0.25));
				}
			}

			cam.walk = {
				forward: (dt)=> {
					if (cam.is_airborn()) { dt *= 0.25; }
					var accel = cam.forward().mul(-dt * cam.force / cam.mass);
					velocity = velocity.add(accel);
				},
				backward: (dt)=> {
					if (cam.is_airborn()) { dt *= 0.25; }
					var accel = cam.forward().mul(dt * cam.force / cam.mass);
					velocity = velocity.add(accel);
				},
				left: (dt)=> {
					if (cam.is_airborn()) { dt *= 0.25; }
					var accel = cam.left().mul(dt * cam.force / cam.mass);
					velocity = velocity.add(accel);
				},
				right: (dt)=> {
					if (cam.is_airborn()) { dt *= 0.25; }
					var accel = cam.left().mul(-dt * cam.force / cam.mass);
					velocity = velocity.add(accel);
				}
			};

			cam.force = (force, dt) => {
				var accel = force.mul(dt / cam.mass);
				velocity = velocity.add(accel);
			};

			cam.velocity = (vel) => {
				if (vel) { velocity = vel; }
				else { return velocity; }
			};

			cam.tilt = (d_pitch, d_yaw) => {
				const new_pitch = pitch + d_pitch;

				if (new_pitch > cam.min_pitch && new_pitch < cam.max_pitch)
				{
					pitch = new_pitch;
				}

				yaw += d_yaw;

				const pos = cam.position();

				const qx = [].quat_rotation([1, 0, 0], pitch);
				const qy = [].quat_rotation([0, 1, 0], yaw);
				const q = cam._q = qy.quat_mul(qx)

				const up = q.quat_rotate_vector([0, 1, 0]);
				const forward = q.quat_rotate_vector([0, 0, -1]);
				// cam._left = cam._q.quat_rotate_vector([-1, 0, 0]));

				cam.view(pos, forward, up);
			};

			cam.pitch = (p) => {
				if (p)
				{
					pitch = p;

					const qx = [].quat_rotation([1, 0, 0], pitch);
					const qy = [].quat_rotation([0, 1, 0], yaw);
					const q = qx.quat_mul(qy);

					let up = qx.quat_rotate_vector([0, 1, 0]);
					up = qy.quat_rotate_vector(up);

					let forward = qx.quat_rotate_vector([0, 0, 1]);
					forward = qy.quat_rotate_vector(forward);

					cam.view(cam.position(), forward, up);
				}
				return pitch;
			};

			cam.yaw = (y) => {
				if (y)
				{
					yaw = y;

					const qx = [].quat_rotation([1, 0, 0], pitch);
					const qy = [].quat_rotation([0, 1, 0], yaw);
					const q = qx.quat_mul(qy)

					const up = q.quat_rotate_vector([0, 1, 0]);
					const forward = q.quat_rotate_vector([0, 0, 1]);
					cam.forward(forward);
				}
				return yaw;
			};

			cam.last_collisions = () => { return last_collisions; }

			cam.is_airborn = () => {
				var sum = 0;
				for (var i = 0; i < last_collisions.length; i++)
				{
					sum += last_collisions[i].normal.dot([0, 1, 0])
				}
				return sum < 0.0001;
			}

			cam.update = (dt)=> {
				var new_vel = [0, 0, 0];

				if (opts.dynamics)
				{
					new_vel = opts.dynamics(cam, dt);
				}
				else
				{ // default dynamics
					var net_force = [0, 0, 0];

					for (var i = 0; i < cam.forces.length; i++)
					{
						net_force = net_force.add(cam.forces[i]);
					}

					const net_accel = net_force.mul(dt / cam.mass);
					var new_vel = velocity.add(net_accel);
				}

				last_collisions = [];

				if (opts && opts.collides)
				for (var i = coll_offsets.length; i--;)
				for (var j = coll_dirs.length; j--;)
				{
					var dir = coll_dirs[j];

					const new_vel_dt = new_vel.mul(dt);
					if (dir.dot(new_vel_dt) > 0)
					{
						dir = dir.add(new_vel_dt);
					}

					const collision = opts.collides(
						coll_offsets[i].add(cam.position()),
						dir
					);

					if (collision)
					{
						if (collision.normal.dot(velocity) - 0.001 >= 0) { continue; }

						last_collisions.push(collision);

						if (opts.on_collision) { opts.on_collision(cam, collision); }
						else
						{
							const cancled = new_vel.mul(collision.normal.abs());
							new_vel = new_vel.sub(cancled);
						}
					}
				}

				if (last_collisions.length > 0)
				{
					new_vel = new_vel.add(new_vel.mul(-cam.friction * dt));
				}

				if (!isFinite(new_vel[0]))
				{
					console.log('why');
				}

				velocity = new_vel;
				const pos = cam.position().add(velocity.mul(dt));

				const qx = [].quat_rotation([1, 0, 0], pitch);
				const qy = [].quat_rotation([0, 1, 0], yaw);
				const q = cam._q = qy.quat_mul(qx)

				const up = q.quat_rotate_vector([0, 1, 0]);
				const forward = q.quat_rotate_vector([0, 0, -1]);
				// cam._left = cam._q.quat_rotate_vector([-1, 0, 0]));

				cam.view(pos, forward, up);

			};

			return cam;
		}
	},
};

Array.prototype.within_sphere = function(sphere, position_key, item_cb)
{
	if (typeof(position_key) == 'string')
	{
		const key_str = position_key;
		position_key = function(item) { return item[key_str]; }
	}

	for (var i = 0; i < this.length; ++i)
	{
		const pos = position_key(this[i]);
		if (pos.sub(sphere).len() <= sphere[3]) { return item_cb(i); }
	}
}

Array.prototype.is_matrix = function()
{
	return this[0] && this[0].constructor === Array;
}

Array.prototype.new_matrix = function(rows, cols)
{
	var M = new Array(rows);
	for (var r = rows; r--;)
	{
		M[r] = new Array(cols);
		for (var c = cols; c--;) { M[r][c] = 0; }
	}
	return M;
};

Array.prototype.sum = function()
{
	var sum = 0;
	for (var i = this.length; i--;) { sum += this[i]; }
	return sum;
}

Array.prototype.add = function(v)
{
	var r = new Array(this.length);

	if (typeof v === 'number')        { for (var i = this.length; i--;) r[i] = this[i] + v; }
	else if (v.constructor === Array) { for (var i = this.length; i--;) r[i] = this[i] + v[i]; }

	return r;
};

Array.prototype.sub = function(v)
{
	var r = new Array(this.length);

	if (typeof v === 'number')        { for (var i = this.length; i--;) r[i] = this[i] - v; }
	else if (v.constructor === Array) { for (var i = this.length; i--;) r[i] = this[i] - v[i]; }

	return r;
};

Array.prototype.floor = function()
{
	var r = new Array(this.length);

	for (var i = this.length; i--;) r[i] = Math.floor(this[i]);

	return r;
};

Array.prototype.ceil = function()
{
	var r = new Array(this.length);

	for (var i = this.length; i--;) r[i] = Math.ceil(this[i]);

	return r;
};

Array.prototype.abs = function()
{
	var r = new Array(this.length);

	for (var i = this.length; i--;) r[i] = Math.abs(this[i]);

	return r;
};

Array.prototype.mul = function(v)
{
	var w = new Array(this.length);

	if (typeof v === 'number')
	{
		if (this.is_matrix())
		{
			const dims = this.mat_dims();
			for (var r = dims[0]; r--;)
			{
				w[r] = new Array(dims[1]);
				for (var c = dims[1]; c--;)
				{
					w[r][c] = this[r][c] * v;
				}
			}
		}
		else
		{
			for (var i = this.length; i--;) w[i] = this[i] * v;
		}
	}
	else if (v.constructor === Array && typeof v[0] === 'number') { for (var i = this.length; i--;) w[i] = this[i] * v[i]; }

	return w;
};

Array.prototype.eq = function(v)
{
	for (var i = 0; i < this.length; i++)
	{
		if (this[i] !== v[i]) { return false; }
	}

	return true;
};

Array.prototype.pow = function(ex)
{
	var w = new Array(this.length);

	if (typeof ex === 'number')
	{
		if (this.is_matrix())
		{
			const dims = this.mat_dims();
			for (var r = dims[0]; r--;)
			{
				w[r] = new Array(dims[1]);
				for (var c = dims[1]; c--;)
				{
					w[r][c] = Math.pow(this[r][c], ex);
				}
			}
		}
		else
		{
			for (var i = this.length; i--;) w[i] = Math.pow(this[i], ex);
		}
	}
	else if (v.constructor === Array && typeof ex[0] === 'number') { for (var i = this.length; i--;) w[i] = Math.pow(this[i], ex[i]); }

	return w;
};

Array.prototype.div = function(v)
{
	var r = new Array(this.length);

	if (typeof v === 'number')        { for (var i = this.length; i--;) r[i] = this[i] / v; }
	else if (v.constructor === Array) { for (var i = this.length; i--;) r[i] = this[i] / v[i]; }

	return r;
};

Array.prototype.lerp = function(v, p)
{
	var r = new Array(this.length);
	for (var i = 0; i < r.length; i++) { r[i] = this[i] * (1-p) + v[i] * p; }
	return r;
};

Array.prototype.len = function()
{
	if (typeof this[0] !== 'number') { return NaN; }

	return Math.sqrt(this.dot(this));
};

Array.prototype.dist = function(v)
{
	return this.sub(v).len();
}

Array.prototype.norm = function()
{
	if (typeof this[0] !== 'number') { return null; }

	return this.div(this.len());
}

Array.prototype.mat_dims = function()
{
	return [ this.length, this[0].length ];
};

Array.prototype.intersects_sphere = function(origin, radius)
{
	const l = origin;
	const s = this.dot(l);
	const l_2 = l.dot(l);
	const r_2 = radius * radius;
	var t = 0;

	if (s < 0 && l_2 > r_2) { return false; }

	const m_2 = l_2 - s * s;

	if (m_2 > r_2) { return false; }

	const q = Math.sqrt(r_2 - m_2);

	if (r_2 - m_2)
	{
		t = s - q;
	}
	else
	{
		t = s + q;
	}

	return this.mul(t);
};

Array.prototype.mat_mul = function(m)
{
	var M = this.matrix();
	var N = m.matrix();

	const m0_dims = M.mat_dims();
	const m1_dims = N.mat_dims();

	var O = this.new_matrix(m0_dims[0], m1_dims[1]);

	var inner = m0_dims[1];
	for (var r = m0_dims[0]; r--;)
	for (var c = m1_dims[1]; c--;)
	{
		O[r][c] = 0;
		for (var i = inner; i--;) { O[r][c] += M[r][i] * N[i][c]; }
	}

	return O;
};

Array.prototype.swap_rows = function(row_i, row_j)
{
	const tmp = this[i];
	this[i] = this[j];
	this[j] = tmp;
	return this;
};

Array.prototype.augment = function()
{
	const dims = this.mat_dims();
	const R = dims[0], C = dims[1];
    const Mc = C * 2;
    var M = this.new_matrix(R, Mc);

    for (var r = R; r--;)
    {
        // form the identity on the right hand side
        M[r][r + C] = 1.0;

        for (var c = C; c--;)
        {
            M[r][c] = this[r][c];
        }
    }

    return M;
};

Array.prototype.rref = function()
{
	var M = this.matrix();
	const dims = M.mat_dims();
	const R = dims[0], C = dims[1];
	var piv_c = 0;

    // compute upper diagonal
    for (var r = 0; r < R; r++)
    {
        // Check if the piv column of row r is zero. If it is, lets
        // try to find a row below that has a non-zero column
        if (M[r][piv_c] == 0)
        {
            var swap_ri = -1;
            for (var ri = r + 1; ri < R; ri++)
            {
                if (M[ri][piv_c] != 0)
                {
                    swap_ri = ri;
                    break;
                }
            }

            if (swap_ri > -1) { M.swap_rows(swap_ri, r); }
        }

        { // next row, scale so leading coefficient is 1
            const d = 1 / M[r][piv_c];

            // scale row
            for (var c = piv_c; c < C; c++) { M[r][c] *= d; }
        }


        for (var ri = 0; ri < R; ri++)
        {
            // skip zero elements and skip row r
            if (M[ri][piv_c] == 0 || ri == r) { continue; }

            const d = M[ri][piv_c];

            // scale row then subtract the row above to zero out
            // other elements in this column
            for (var c = piv_c; c < C; c++)
            {
                M[ri][c] -= d * M[r][c];
            }
        }

        ++piv_c;
    }

	return M;
};

Array.prototype.inverse = function()
{
	const dims = this.mat_dims();
	const R = dims[0], C = dims[1];
	const _rref = this.augment().rref();

	var M = new Array(R);

	for (var r = R; r--;)
	{
		var s = _rref[r].slice(C, 2 * C);
		M[r] = s;
	}

	return M;
};

Array.prototype.flatten = function()
{
	var v = [];

	if (typeof(this[0]) === 'number') { v = this; }
	else
	{
		for (var i = 0; i < this.length; ++i)
		{
			v = v.concat(this[i].flatten());
		}
	}

	return v;
};

Array.prototype.as_Float32Array_bin = function() {
	const flat = this.flatten();
	var buf = new ArrayBuffer(flat.length * 4);
	var a = new Float32Array(buf);

	for (var i = flat.length; i--;)
	{
		a[i] = flat[i];
	}

	return buf;
};

Array.prototype.as_Float32Array = function() {
	return new Float32Array(this.flatten());
};

Array.prototype.as_Int32Array = function(first_argument) {
	return new Int32Array(this.flatten());
};

Array.prototype.as_Int16Array = function(first_argument) {
	return new Int16Array(this.flatten());
};

Array.prototype.transpose = function()
{
	const dims = this.mat_dims();
	var M = this.new_matrix(dims[1], dims[0]);

	for (var r = dims[0]; r--;)
	for (var c = dims[1]; c--;)
	{
		M[c][r] = this[r][c];
	}

	return M;
};

Array.prototype.matrix = function()
{
	if (this[0].constructor === Array) { return this; }
	else { return [this].transpose(); }
};

Array.prototype.random_unit = function()
{
	return [Math.random(), Math.random(), Math.random()].sub([0.5, 0.5, 0.5]).norm();
}

Array.prototype.I = function(dim)
{
	var M = this.new_matrix(dim, dim);

	for (var r = dim; r--;)
	for (var c = dim; c--;)
	{
		M[c][r] = r == c ? 1 : 0;
	}

	return M;
};

Array.prototype.dot = function(v)
{
	var s = 0;
	for (var i = this.length; i--;) s += this[i] * v[i];
	return s;
}

Array.prototype.cross = function(v)
{
	return [
		this[1] * v[2] - this[2] * v[1],
		this[2] * v[0] - this[0] * v[2],
		this[0] * v[1] - this[1] * v[0]
	];
}

Array.prototype.mat_scale = function(s)
{
	return [
		[    s[0], 0,    0,    0    ],
		[    0,    s[1], 0,    0    ],
		[    0,    0,    s[2], 0    ],
		[    0,    0,    0,    1.   ]
	];
};

Array.prototype.translate = function(t)
{
	return [
		[    1,    0,    0,    0    ],
		[    0,    1,    0,    0    ],
		[    0,    0,    1,    0    ],
		[  t[0], t[1], t[2],   1.   ]
	];
};

Array.prototype.perspective = function(fov, aspect, n, f)
{
	const a = Math.tan(Math.PI * 0.5 - 0.5 * fov);
	const fsn = f - n;
	const fpn = f + n;
	const ftn = f * n;

	return [
	       [  a/aspect,         0,          0,         0 ],
	       [         0,         a,          0,         0 ],
	       [         0,         0,   -fpn/fsn,        -1 ],
	       [         0,         0, -2*ftn/fsn,         0 ]
	];

	// return [
	//        [  a/aspect,         0,          0,         0 ],
	//        [         0,         a,          0,         0 ],
	//        [         0,         0,   -fpn/fsn,        -1 ],
	//        [         0,         0, -2*ftn/fsn,         1 ]
	// ];
};

Array.prototype.orthographic = function(r, l, t, b, n, f)
{
	const rml = r - l;
	const rpl = r + l;
	const tmb = t - b;
	const tpb = t + b;
	const fmn = f - n;
	const fpn = f + n;

	// return [
	//        [  2/rml,         0,          0, -rpl/rml ],
	//        [      0,     2/tmb,          0, -tpb/tmb ],
	//        [      0,         0,     -2/fmn, -fpn/fmn ],
	//        [      0,         0,          0,        1 ]
	// ];

	return [
		[2/rml,     0,      0,     0],
		[    0, 2/tmb,      0,     0],
		[    0,     0, -2/fmn,     0],
		[    0,     0,      0,     1],
	];
};

Array.prototype.view = function(position, forward, up)
{
	const r = forward.cross(up).mul(1);
	const u = up;
	const t = r.cross(forward);
	const f = forward;
	const p = position;

	var ori = [
		[ r[0], t[0], f[0], 0 ],
		[ r[1], t[1], f[1], 0 ],
		[ r[2], t[2], f[2], 0 ],
		[    0,    0,    0, 1 ]
	];

	var trans = [
		[     1,     0,     0,    0 ],
		[     0,     1,     0,    0 ],
		[     0,     0,     1,    0 ],
		[ -p[0], -p[1], -p[2],    1 ]
	];

	//return ori;
	return trans.mat_mul(ori);
	//return ori.mat_mul(trans);
};

Array.prototype.rotation = function(axis, angle)
{
	const a = axis;
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const omc = 1 - c;

	return [
		[c+a[0]*a[0]*omc,      a[1]*a[0]*omc+a[2]*s, a[2]*a[0]*omc-a[1]*s, 0],
		[a[0]*a[1]*omc-a[2]*s, c+a[1]*a[1]*omc,      a[2]*a[1]*omc+a[0]*s, 0],
		[a[0]*a[2]*omc+a[1]*s, a[1]*a[2]*omc-a[0]*s, c+a[2]*a[2]*omc,      0],
		[                   0,                    0,                    0, 1]
	];
};


Array.prototype.scale = function(s)
{
    var m;
    if (typeof(s) === 'number')
    {
        m = [].I(4).mul(s);
        m[3][3] = 1;
    }
    else if (s instanceof Array)
    {
        m = [].I(s.length);
        for (var i = s.length; i--;)
        {
            m[i][i] = s[i];
        }
    }

	return m;
}


Array.prototype.quat_rotation = function(axis, angle)
{
	var a_2 = angle / 2;
	var a = Math.sin(a_2);

	const _axis = axis.mul(a);

	return _axis.concat(Math.cos(a_2));
};


Array.prototype.quat_rotate_vector = function(v)
{
	var q_xyz = this.slice(0, 3);

	var t = q_xyz.cross(v);
	t = t.mul(2);

	var u = q_xyz.cross(t);
	t = t.mul(this[3]);

	return v.add(t).add(u);
};


Array.prototype.quat_to_matrix = function()
{
	var v = this;
	var a = v[3], b = v[0], c = v[1], d = v[2];
	var a2 = a * a, b2 = b * b, c2 = c * c, d2 = d * d;

	return [
	    [ a2 + b2 - c2 - d2, 2*b*c - 2*a*d  , 2*b*d + 2*a*c  , 0],
	    [ 2*b*c + 2*a*d  , a2 - b2 + c2 - d2, 2*c*d - 2*a*b  , 0],
	    [ 2*b*d - 2*a*c  , 2*c*d + 2*a*b  , a2 - b2 - c2 + d2, 0],
	    [ 0                , 0                , 0                , 1],
	];
};

Array.prototype.quat_conjugate = function()
{
	return this.mul([-1, -1, -1, 1]);
}

Array.prototype.quat_inverse = function()
{
	const mag_2 = this.dot(this);
	return this.quat_conjugate().mul(1/mag_2);
}

Array.prototype.quat_mul = function(q)
{
	// var q0 = this;
	// var q1 = q;

	// var t3 = q0.slice(0, 3);
	// var o3 = q1.slice(0, 3);

	// var r = t3.cross(o3);
	// var w = t3.mul(q1[3]);
	// r = r.add(w);
	// w = o3.mul(q0[3]);
	// r = r.add(w);

	// return r.concat(q0[3] * q1[3] - t3.dot(o3));
	return [
	    this[3] * q[0] + this[0] * q[3] + this[1] * q[2] - this[2] * q[1],  // i
	    this[3] * q[1] - this[0] * q[2] + this[1] * q[3] + this[2] * q[0],  // j
	    this[3] * q[2] + this[0] * q[1] - this[1] * q[0] + this[2] * q[3],   // k
	    this[3] * q[3] - this[0] * q[0] - this[1] * q[1] - this[2] * q[2],  // 1
	];
};

String.prototype.format = function(value_list)
{
	const parts = this.split('{}');
	var out = '';
	var vi = 0;

	for (var i = 0; i < parts.length; i++)
	{
		out += parts[i];
		if (vi < value_list.length) { out += value_list[vi++]; }
	}

	return out;
}

function for_each(obj, cb)
{
	if (!obj) { return obj; }
	if (obj.constructor === Array)
	{
		return obj.for_each(cb);
	}
	else
	{
		for (var k in obj)
		{
			if (!obj.hasOwnProperty(k)) { continue; }
			cb(obj[k], k, this);
		}

		return obj;
	}
}

Array.prototype.for_each = function(cb)
{
	for (var i = 0; i < this.length; ++i)
	{
		cb(this[i], i, this);
	}

	return this;
};

Array.prototype.accumulate = function(dst_key, src_key, scale)
{
	scale = scale || 1;

	for (var i = this.length; i--;)
	{
		this[i][dst_key] = this[i][dst_key].add(this[i][src_key].mul(scale));
	}
};

Array.prototype.pick = function()
{
	return this[Math.floor(Math.random() * this.length)];
};


Array.prototype.timed_queue = function() {
	this.last_idx = function() { return this.length - 1 < 0 ? 0 : this.length - 1; },
	this.peek = function()
	{
		if (this.empty()) { return null; }
		return this[this.last_idx()].value;
	};

	this.empty = function() { return this.length == 0; };

	this.push = function(val, time)
	{
		const v = val.value || val;
		const t = val.time || time;
		this.unshift({ value: v, time: t });
	};

	this.update = function(dt)
	{
          if (this.empty()) { return this; }

	  this[this.last_idx()].time -= dt;
          const time = this[this.last_idx()].time;

	  if (time <= 0) { this.pop(); }
	}

	return this;
};

Math.ray = function(ray)
{
	return {
		intersects: {
			sphere: function(position, radius)
			{
				const l = position.sub(ray.position);
				const s = ray.direction.dot(l);
				const l_2 = l.dot(l);
				const r_2 = radius * radius;
				var t = 0;

				if (s < 0 && l_2 > r_2) { return false; }

				const m_2 = l_2 - s * s;

				if (m_2 > r_2) { return false; }

				const q = Math.sqrt(r_2 - m_2);

				if (r_2 - m_2)
				{
					t = s - q;
				}
				else
				{
					t = s + q;
				}

				return t;
			}
		}
	};
};

Math.random.uni = function()
{
	return 2 * Math.random() - 1;
}

Math.random.unit_vector = function(i)
{
	i = i || Math.floor(Math.random() * 1000);

	// compute random rotation axis look up table
	if (!this._uv_lut)
	{
		this._uv_lut = [];
		for(var _ = 1000; _--;)
		{
		    this._uv_lut.push([].random_unit());
		}
	}

	return this._uv_lut[i];
}

Math.model_matrix = function(obj)
{
	var M = [].I(4);

	if ('scale' in obj)
	{
		M = M.mat_mul([].scale(obj.scale))
	}
	if ('q' in obj)
	{
		M = M.mat_mul(obj.q.quat_inverse().quat_to_matrix());
	}
	if ('position' in obj)
	{
		M = M.mat_mul([].translate(obj.position));
	}

	return M;
};

try
{
	module.exports = g;
	module.exports.for_each = for_each;
}
catch(e)
{
	g.for_each = for_each;
	console.log('Not a node.js module');
}
