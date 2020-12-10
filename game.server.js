const g = require('./static/js/g.js');
const _7d = require('./static/js/7dfps.js');
const fs = require('fs');
var vars = null;
const level_str = './static/voxels/level.spawners.json';

module.exports.server = {

	// map of all connected players
	players: {},


	// complete game state
	state: {
		nav_grid: null,
		world: null,
		teams: null,
		turn: 0,
		last_turn: 0,
		turn_time: 0,
	},

	// server initialization goes here
	setup: function(state)
	{
		{ // load color mapping
			try
			{
				const text = fs.readFileSync('./vars.json');
				vars = JSON.parse(text);
			}
			catch(e)
			{
				console.log('game variables failed: ' + e);
			}
		}

		state.teams = {
			red: _7d.team.create(state, vars),
			blue: _7d.team.create(state, vars),
		};

		state.projectiles = _7d.projectile_batch.create(100, 0.0);
		state.projectiles.accelerations().push([0, -9.8, 0]);

		{ // load level
			const path = level_str;
			const text = fs.readFileSync(path);
			var world = null;
			try
			{
				const json = JSON.parse(text);
				_7d.spawn_points(state, json);
				world = g.voxel.create(json);
			}
			catch(e)
			{
				console.log('loading voxels failed: ' + e);
			}
		}

		state.world = world;
		// state.teams.red.spawn_units();
		// state.teams.blue.spawn_units();

		state.nav_grid = _7d.grid(vars.colors, -1, world);
		state.turn = 0;

		console.log('Server initialized');
	},


	// handlers for all player connection events
	player: {
		connected: function(player, state)
		{
			console.log('player: ' + player.id + ' connected');

			player.team = 'spectator';
			player.walk_dir = [0, 0];
			player.unit = _7d.unit.create(state, vars);
			player.moves = [];
			player.last_target = [0, 0, 0];
			player.shooting = false;
			player.shot_cooldown = 0;
			player.time_shooting = 0;
			player.accumulated_damage = 0;

			player.is_my_turn = function()
			{
				let team = ['red', 'blue'][state.turn % 2];
				if (team == player.team)
				{
					let idx = Math.floor(state.turn / 2) % state.teams[team].players.length;
					return state.teams[team].players.indexOf(player.id) == idx;
				}

				return false;
			}

			let red_team = state.teams.red;
			let blue_team = state.teams.blue;

			if (red_team.players.length  < 3 ||
				blue_team.players.length < 3)
			{
				if (red_team.players.length <= blue_team.players.length)
				{
					console.log('player ' + player.id + " joins red");
					player.team = 'red';
					red_team.players.push(player.id);
					red_team.spawn_player(player);
				}
				else
				{
					console.log('player ' + player.id + " joins blue");
					player.team = 'blue';
					blue_team.players.push(player.id);
					blue_team.spawn_player(player);
				}
			}

			player.emit('id', player.id);
			player.emit('team', player.team);

			player.on('do_move', () => {
				if (player.unit.hp() <= 0) { return; }
				if (!player.is_my_turn()) { return; }
				if (player.moves.length > 0) { return; }
				if (!player.nav || !player.nav.path) { return; }
				console.log('player ' + player.id +' start move');
				player.emit('nav', {choices: [], path: null});
				player.moves = player.nav.path;
				state.turn++;
			});

			player.on('trigger_down', () => {
				if (player.unit.hp() <= 0) { return; }

				player.shooting = true;
				player.time_shooting = 0;
				console.log('player ' + player.id +' starts shooting');
			});

			player.on('trigger_up', () => {
				if (player.unit.hp() <= 0) { return; }

				player.shooting = false;
				player.shot_cooldown = 0;
				console.log('player ' + player.id +' stops shooting');
			});

			player.on('angles', (pitch_yaw) => {
				if (player.unit.hp() <= 0) { return; }
				// if (isNaN(pitch_yaw[0]) || isNaN(pitch_yaw[1])) { return; }  
				player.unit.angles(pitch_yaw[1], pitch_yaw[0]);
				// If the player is moving, don't update nav grid stuff
				if (player.moves.length > 0) { return; }

				let eyes = player.unit.eyes();
				let ray = player.unit.forward().mul(300);
				let int = state.world.intersection(eyes, ray);

				if (int)
				{
					nav_int = state.nav_grid.sample(int.point.add([0, 5, 0]));

					if (!nav_int) { return; }
					nav_int.point = nav_int.point.add([5, 0, 5]);

					if (!player.last_target.eq(nav_int.point))
					{
						if (!player.is_my_turn())
						{
							player.emit('nav', {choices: [], path: null});
							player.emit('selected', -1);
						}
						else
						{
							player.nav = _7d.nav.choices(
								state.nav_grid,
								player.unit.position().add([0, 1, 0]),
								player.unit.action_points(),
								nav_int.point
							);
							player.emit('nav', player.nav);

							if (nav_int.cell < 0)
							{
								var selection = -1;
								for (var i = 0; i < player.nav.choices.length; i++)
								{
									if(player.nav.choices[i].dist(nav_int.point) < 10)
									{
										selection = i;
										break;
									}
								}

								player.emit('selected', selection);
							}
						}
						
					}
					

					

					player.last_target = nav_int.point;
				}
			});

			// player.on('jump', () => {
			// 	if (!player.cam.is_airborn())
			// 	{
			// 		player.cam.velocity(player.cam.velocity().add([0, 6, 0]));
			// 	}
			// });
		},

		update: function(player, state, dt)
		{
			// don't update the player if they are dead
			if (player.hp <= 0) { return; }

			if (player.moves && player.moves.length > 0)
			{
				// console.log('dest ' + player.moves[0]);
				// console.log('player ' + player.unit.position());
				var delta = player.moves[0].sub(player.unit.position());
				// console.log('delta ' + delta);
				// console.log(player.moves);

				if (delta.len() < 0.5)
				{
					// console.log('arrived');
					player.moves = player.moves.slice(1);
					player.unit.velocity([0, 0, 0]);

					if (player.moves.length == 0)
					{
						console.log('player: ' + player.id + ' move complete');
					}
				}
				else
				{
					player.unit.velocity(delta.norm().mul(25));
				}
			}

			if (player.shooting)
			{
				// console.log('unit: ' + player.unit.type());
				// console.log('rps: ' + vars.units[player.unit.type()].weapon.rounds_sec);
				if (player.shot_cooldown <= 0)
				{
					let unit = player.unit.type();
					let unit_vars = vars.units[unit];

					let proj_stats = unit_vars.weapon.projectile;
					let sb_yaw = proj_stats.spread_yaw_base * 3.1415/180;
					let sb_pitch = proj_stats.spread_pitch_base * 3.1415/180;
					let proj_vel = proj_stats.velocity_unit_sec;

					let yaw_sp = [].quat_rotation([0, 1, 0], Math.random.uni() * (sb_yaw + proj_stats.spread_yaw_deg_sec * player.time_shooting));
					let pitch_sp = [].quat_rotation([1, 0, 0], Math.random.uni() * (sb_pitch + proj_stats.spread_pitch_deg_sec * player.time_shooting));
					let sp_q = pitch_sp.quat_mul(yaw_sp);
					state.projectiles.spawn(
						player.unit.eyes(), // position
						sp_q.quat_rotate_vector(player.unit.forward().mul(proj_vel)), // velocity
						proj_stats.mass, // mass
						player.id // owner
					);
					player.shot_cooldown = 1.0 / unit_vars.weapon.rounds_sec;

					player.time_shooting += dt;
				}
			}

			if (player.accumulated_damage)
			{ // handle accumulated player damage here
				let last_hp = player.unit.hp();

				player.unit.hp(last_hp - player.accumulated_damage);
				console.log('player: ' + player.id + ' took ' + player.accumulated_damage + ' damage, new hp ' + player.unit.hp());

				if (last_hp > 0 && player.unit.hp() <= 0)
				{ // Player was killed
					console.log('player: ' + player.id + ' was killed');
					player.emit('killed');
					player.emit('team', 'spectator');
				}

				player.accumulated_damage = 0;
			}

			player.shot_cooldown -= dt;
			player.unit.position(player.unit.position().add(player.unit.velocity().mul(dt)));
		},

		disconnected: function(player, state)
		{
			switch(player.team)
			{
				case 'red':
				case 'blue':
					// remove the player's id from their team's player list
					let players = state.teams[player.team].players;
					players.splice(players.indexOf(player.id), 1);
					console.log('player: ' + player.id + ' leaves ' + player.team);
					break;
				default: break;
			}
			console.log('player: ' + player.id + ' disconnected');
		}
	},


	// main game loop
	update: function(players, state, dt)
	{
		if (state.teams['red'].players.length * state.teams['blue'].players.length == 0) { return; }
		state.projectiles.update(state.world, players, dt);
		// console.log('projectiles: ' + state.projectiles.active().length);

		{ // Handle turn expiration here
			if (state.last_turn != state.turn)
			{
				let next_player = players[_7d.active_player(state, players)];
				next_player.emit('your_turn');

				next_player.nav = _7d.nav.choices(
					state.nav_grid,
					next_player.unit.position().add([0, 1, 0]),
					next_player.unit.action_points()
				);
				next_player.emit('nav', next_player.nav);

				state.turn_time = vars.player.turn_sec;
			}

			state.last_turn = state.turn;
			state.turn_time -= dt;
			if (state.turn_time <= 0)
			{
				console.log('active ' + _7d.active_player(state, players));
				players[_7d.active_player(state, players)].emit('nav', {choices: [], path: null});
				state.turn += 1; 
			}
		}

		{ // player projectile collisions

		}
	},


	send_states: function(players, state)
	{
		var tx_state = {
			red: {
				players: {}
			},
			blue: {
				players: {}
			},
			projectiles: state.projectiles.active(),
			turn: state.turn
		};

		for (var team_name in state.teams)
		{
			let team = state.teams[team_name];

			for (var i = 0; i < team.players.length; i++)
			{
				let unit = players[team.players[i]].unit;
				tx_state[team_name].players[team.players[i]] = {
					type: unit.type,
					pos: unit.position(),
					angs: unit.angles()
				};
			}
		}

		for (var id in players)
		{
			let player = players[id];
			if (!player.emit) { continue; }
			player.emit('state', tx_state);
		}
	}
};
