
var level_str = 'voxel/level.spawners';

const cam_colision_check = (new_pos, new_vel) => {
    const vox = g.web.assets[level_str];
    return vox.intersection(new_pos.add(vox.center_of_mass()), new_vel);
};

var state = {
    me: {
        team: 'spectator',
        cam:g.camera.fps({
            collides: cam_colision_check,
            dynamics: function(cam, dt)
            {
                return cam.velocity().mul(0.9);
            }
        })
    },
    player_anims: {},
    rx_state: null,
};


state.me.cam.position([0, 20, 0]);
// cam.forces.push([0, -9, 0]);
state.me.cam.mass = 0.1;
state.me.cam.force = 500;
state.me.crouching = false;
// cam.friction = 5;

var shadow_map = null;
var text_demo = null;
var light = g.camera.create();
var walk_action = [0, 0];
var walk_sounds = [];
var servo_sounds = [];
var step_cool = 0;

g.web.canvas(document.getElementById('primary'));

function grid(color_mapping, nav_cell_idx, voxel)
{
    // find a spawn point to start at
    var spawn_point = [0, 0, 0];
    var spawn_color_red = color_mapping.spawn_point_red.mul(1/255);
    var spawn_color_blue = color_mapping.spawn_point_blue.mul(1/255);
    voxel.each_voxel((x, y, z) => {
        const color = voxel.palette[voxel.cells[x][y][z]];
        if (spawn_color_red.eq(color) || spawn_color_blue.eq(color))
        {
            spawn_point = [x, y, z];
            return true; // marks that we are done
        }
    });

    var nav_grid = voxel.downsample(10);

    console.log(nav_grid);

    let flood_fill = (x, y, z) => {
        if (x < 0 || x >= nav_grid.width) { return; }
        if (y < 0 || y >= nav_grid.height) { return; }
        if (z < 0 || z >= nav_grid.depth) { return; }
        var below = 0;
        if (y - 1 >= 0) below = nav_grid.cells[x][y - 1][z];
        if (nav_grid.cells[x][y][z] != 0 || below == nav_cell_idx || below == 0)
        { return; }

        nav_grid.cells[x][y][z] = nav_cell_idx;

        flood_fill(x - 1, y, z);
        flood_fill(x - 1, y + 1, z);
        flood_fill(x + 1, y, z);
        flood_fill(x + 1, y + 1, z);
        flood_fill(x, y, z + 1);
        flood_fill(x, y + 1, z + 1);
        flood_fill(x, y, z - 1);
        flood_fill(x, y + 1, z - 1);
    };

    spawn_point = spawn_point.mul(1/10).floor();
    flood_fill(spawn_point[0], spawn_point[1], spawn_point[2]);

    return nav_grid;
}

g.initialize(function ()
{
    g.is_running = false;

    // prune out the spawner voxels
    g.web.assets.processors['spawners'] = function(voxel_json)
    {
        for (var vi = 0; vi < voxel_json.XYZI.length; vi++)
        {
            const set = voxel_json.XYZI[vi];
            const color = [ voxel_json.RGBA[set.c-1].r, voxel_json.RGBA[set.c-1].g, voxel_json.RGBA[set.c-1].b ];

            if (color.eq([255, 0, 0]))
            {
                voxel_json.XYZI[vi].c = 1;
            }

            if (color.eq([0, 0, 255]))
            {
                voxel_json.XYZI[vi].c = 1;
            }
        }

        return voxel_json;
    };

    g.web.assets.load(asset_list,
    function() {
        g.web.gfx.shader.create('basic_textured',
            g.web.assets['shaders/basic_textured.vert'],
            g.web.assets['shaders/basic_textured.frag']
        );

        g.web.gfx.shader.create('basic_colored',
            g.web.assets['shaders/basic_colored.vert'],
            g.web.assets['shaders/basic_colored.frag']
        );

        g.web.gfx.shader.create('depth_only',
            g.web.assets['shaders/depth_only.vert'],
            g.web.assets['shaders/depth_only.frag']
        );

        g.web.gfx.shader.create('nav_point',
            g.web.assets['shaders/nav_point.vert'],
            g.web.assets['shaders/nav_point.frag']
        );

        g.web.assets['mesh/plane'] = g.web.gfx.mesh.plane();

        for (var i = 0; i < 5; i++)
        {
            walk_sounds.push(new g.web.assets['sound/step' + i]([0, 0, 0]));
        }

        for (var i = 0; i < 2; i++)
        {
            servo_sounds.push(new g.web.assets['sound/servo' + i]([0, 0, 0]));
        }

        shadow_map = g.web.gfx.render_target.create({width: 1024, height: 1024}).shadow_map();

        g.is_running = true;

        // const nav = grid({
        //     "spawn_point_red": [255, 0, 0],
        //     "spawn_point_blue": [0, 0, 255]
        // },
        // 72,
        // g.web.assets[level_str]);
        // g.web.assets[level_str] = g.web.gfx.voxel.create(nav);

        g.web.assets['mesh/nav_point'] = g.web.gfx.mesh.create({
            positions: [[0, 0, 0]]
        });
        g.web.assets['mesh/nav_path'] = g.web.gfx.mesh.create({
            positions: []
        });

        gl.lineWidth(5);
    });

    light.orthographic();

    return true;
});


g.web.pointer.on_move(function (event)
{
    let cam = state.me.cam;
    cam.tilt(event.movementY / 200, event.movementX / 200); 

    g.web.signal('angles', [cam.pitch(), cam.yaw()]);
});


g.web.pointer.on_press(function (event) {
    g.web._canvas.requestPointerLock();
    g.web.signal('trigger_down');
});


g.web.pointer.on_release(function (event) {
    g.web.signal('trigger_up');
});


// g.web.on('id').do((id) => {
//     my_id = id;
//     console.log('you are player ' + id);
// });

// g.web.on('team').do((type_str) => {
//     state.me.team = type_str;
//     my_team = type_str;
//     console.log('you have joined ' + type_str);
// });

g.web.on('nav').do((nav) => {
    state.me.nav = nav;

    if (g.web.assets['mesh/nav_path'])
    {
        g.web.assets['mesh/nav_path'].buffer('positions').set_data(nav.path ? nav.path : []);
    }
});

g.web.on('state').do((s) => {
    let level = g.web.assets[level_str];

    if (!level) { return; }

    state.rx_state = s;

    for (var team in {red: 0, blue: 0})
    {
        for (var pid in s[team].players)
        {
            let p = s[team].players[pid];
            pid = parseInt(pid);
            if (!state.player_anims[pid])
            {
                state.player_anims[pid] = new (g.animation.create({
                    frames: [
                        { asset: "voxel/" + p.type + "/legs/walk/0", duration: 333 },
                        { asset: "voxel/" + p.type + "/legs/walk/1", duration: 333 },
                    ],
                    meta: {
                        frameTags: [
                            { name: "walk", from: 0, to: 1, direction: "forward" },
                        ]
                    } 
                }))();

                state.player_anims[pid].set('walk');
            }
        }

    }

    if (s.my_id != state.me.id || state.me.team != s.my_team)
    {
        state.me.team = s.my_team;
        state.me.id = s.my_id;
        console.log('you are player ' + state.me.id + ' on team ' + state.me.team);
    }

});

g.web.on('selected').do((int) => {
    state.me.selected = int;
});

g.web.on('your_turn').do(() => {
    console.log('your turn');
});


g.update(function (dt)
{
    var vec = [0, 0];
    let level = g.web.assets[level_str];

    if (state.me.team == 'spectator')
    {
        state.me.cam.update(dt);
    }

    step_cool -= dt;

    // if (vec.dot(vec) > 0.00001)
    {
        switch (state.me.team)
        {
            case 'spectator':
                if (g.web.key.is_pressed('w')) { vec = vec.add([ 0, 1 ]); }
                if (g.web.key.is_pressed('s')) { vec = vec.add([ 0,-1 ]); }
                if (g.web.key.is_pressed('a')) { vec = vec.add([-1, 0 ]); }
                if (g.web.key.is_pressed('d')) { vec = vec.add([ 1, 0 ]); }
                if (vec[0] != 0) { state.me.cam.walk.right(dt * vec[0]); }
                if (vec[1] != 0) { state.me.cam.walk.forward(dt * vec[1]); }
                break;
            default:
            {
                if (g.web.key.is_pressed(' '))
                {
                    g.web.signal('do_move');
                }

                let crouching = g.web.key.is_pressed('control');
                if (crouching != state.me.crouching)
                {
                    state.me.crouching = crouching;
                    g.web.signal('crouch', state.me.crouching);
                }
            } break;
        }
    }

    for (var team_name in state.rx_state)
    {
        let team = state.rx_state[team_name];
        for (var id in team.players)
        {
            let player = team.players[id]; 
            // player.pos = player.pos.add(player.vel.mul(dt));

            if (player.vel.dot(player.vel) > 0.001)
            {
                // state.player_anims[id].set('walk');
                state.player_anims[id].pause(false);

                if (step_cool <= 0)
                {
                    walk_sounds.pick().position(player.pos.sub(level.center_of_mass())).play();
                    servo_sounds.pick().position(player.pos.sub(level.center_of_mass())).play();
                    step_cool = 0.333;
                }
            }
            else
            {
                state.player_anims[id].pause(true);
            }

            state.player_anims[id].tick(dt);
        }
    }

    if (state.me.team != "spectator")
    {
        let me = state.rx_state[state.me.team].players[state.me.id];
        let crouch_scale = me.crouch ? (25/39) : 1;
        // let rot_scale = [].quat_rotation([0, 1, 0], me.angs[0]);
        // rot_scale = rot_scale.quat_mul([].quat_rotation([1, 0, 0], me.angs[1]));
        let offset = [].quat_rotation([1, 0, 0], me.angs[1]).quat_rotate_vector([0, 3, 1]);
        offset = [].quat_rotation([0, 1, 0], me.angs[0]).quat_rotate_vector(offset);
        state.me.cam.position(me.pos.add([0, 9 * crouch_scale, 0].add(offset)).sub(level.center_of_mass()));
        state.me.cam.velocity(me.vel);        
    }

    for (var i = 0; i < state.rx_state.projectiles.length; i++)
    {
        let p = state.rx_state.projectiles[i];
        p.pos = p.pos.add(p.vel.mul(dt));
    }

    step_cool -= dt;
});

var t = 0;



const draw_scene = (camera, shader) => {

    const ambient_light = [255/255, 106/255, 135/255].mul(0.6);

    g.web.assets['voxel/skybox']
        .using_shader(shader || 'basic_colored')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
        .with_attribute({name:'a_color', buffer: 'colors', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].scale(20).mat_mul([].translate([0, 200, 0])))
        .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
        .set_uniform('u_light_view').mat4(light.view())
        .set_uniform('u_light_proj').mat4(light.projection())
        .set_uniform('u_light_diffuse').vec3([0.9, 0.7, 0.5])
        .set_uniform('u_light_ambient').vec3(ambient_light)
        .draw_tris();

    let level = g.web.assets[level_str];
    level.using_shader(shader || 'basic_colored')
        .with_attribute({name:'a_position', buffer: 'positions', components: 3})
        .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
        .with_attribute({name:'a_color', buffer: 'colors', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].I(4))
        .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
        .set_uniform('u_light_view').mat4(light.view())
        .set_uniform('u_light_proj').mat4(light.projection())
        .set_uniform('u_light_diffuse').vec3([0.9, 0.7, 0.5])
        .set_uniform('u_light_ambient').vec3(ambient_light)
        .draw_tris();

    // g.web.assets[level_str].using_shader('depth_only')
    //     .with_attribute({name:'a_position', buffer: 'positions', components: 3})
    //     .with_camera(camera)
    //     .set_uniform('u_model').mat4([].I(4))
    //     .draw_lines();

    if (state.me.nav)
    {
        for (var i = 0; i < state.me.nav.choices.length; i++)
        {
            let selected = i == state.me.selected;
            g.web.assets['mesh/nav_point'].using_shader('nav_point')
            .with_attribute({name:'a_position', buffer:'positions', components: 3})
            .with_camera(camera)
            .set_uniform('u_model').mat4([].translate(state.me.nav.choices[i].add([0, -2, 0]).sub(level.center_of_mass())))
            .set_uniform('u_color').vec4(selected ? [0, 1, 0, 1] : [0, 1, 1, 0.5])
            .draw_points();
        }

        g.web.assets['mesh/nav_path'].using_shader('nav_point')
        .with_attribute({name:'a_position', buffer:'positions', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].translate([0, 3, 0].sub(level.center_of_mass())))
        .set_uniform('u_color').vec4([0, 1, 0, 1])
        .draw_line_strip();
    }

    for (var i = 0; i < state.rx_state.projectiles.length; i++)
    {
        let p = state.rx_state.projectiles[i];
        g.web.assets['mesh/nav_point'].using_shader('nav_point')
        .with_attribute({name:'a_position', buffer:'positions', components: 3})
        .with_camera(camera)
        .set_uniform('u_model').mat4([].translate(p.pos.sub(level.center_of_mass())))
        .set_uniform('u_color').vec4([1, 1, 0, 1])
        .draw_points();
    }

    for (var team_name in state.rx_state)
    {
        let team = state.rx_state[team_name];
        for (var id in team.players)
        {

            const p = team.players[id];
            const crouch_scale = p.crouch ? (25/39) : 1;
            let angs = p.angs;

            if (id == state.me.id && state.me.team != "spectator")
            {
                angs[0] = state.me.cam.yaw();
                angs[1] = state.me.cam.pitch();
            }

            let rot_scale = [].quat_rotation([0, 1, 0], 3.1415-angs[0]).quat_to_matrix().mat_mul([].scale(0.20));
            
            { // draw legs
                const model = rot_scale.mat_mul([].translate(p.pos.add([0, 4 * crouch_scale, 0]).sub(level.center_of_mass())));
                let asset = null;

                if (p.hp > 0)
                {
                    asset = state.player_anims[id].current_frame().asset;
                    
                    if (p.crouch)
                    {
                        asset = 'voxel/' + p.type + '/legs/crouch';
                    }
                }
                else
                {
                    asset = 'voxel/' + p.type + '/legs/destroyed';
                }

                g.web.assets[asset].using_shader(shader || 'basic_colored')
                .with_attribute({name:'a_position', buffer: 'positions', components: 3})
                .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
                .with_attribute({name:'a_color', buffer: 'colors', components: 3})
                .with_camera(camera)
                .set_uniform('u_model').mat4(model)
                .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
                .set_uniform('u_light_view').mat4(light.view())
                .set_uniform('u_light_proj').mat4(light.projection())
                .set_uniform('u_light_diffuse').vec3([1, 1, 1])
                .set_uniform('u_light_ambient').vec3(ambient_light)
                .draw_tris();                
            }

            { // draw head
                if (p.hp > 0)
                {
                    asset = 'voxel/' + p.type + '/head/0';
                }
                else
                {
                    asset = 'voxel/' + p.type + '/head/destroyed';
                }

                rot_scale = [].quat_rotation([1, 0, 0], angs[1]).quat_to_matrix().mat_mul(rot_scale);
                const model = rot_scale.mat_mul([].translate(p.pos.add([0, 9 * crouch_scale, 0]).sub(level.center_of_mass())));
                g.web.assets[asset].using_shader(shader || 'basic_colored')
                .with_attribute({name:'a_position', buffer: 'positions', components: 3})
                .with_attribute({name:'a_normal', buffer: 'normals', components: 3})
                .with_attribute({name:'a_color', buffer: 'colors', components: 3})
                .with_camera(camera)
                .set_uniform('u_model').mat4(model)
                .set_uniform('u_shadow_map').texture(shadow_map.depth_attachment)
                .set_uniform('u_light_view').mat4(light.view())
                .set_uniform('u_light_proj').mat4(light.projection())
                .set_uniform('u_light_diffuse').vec3([1, 1, 1])
                .set_uniform('u_light_ambient').vec3(ambient_light)
                .draw_tris();
            }

        }
    }

    if (state.me.team != 'spectator')
    {
        const ret_map = {
            'assault': 'tex/ret_assault',
            'shotgun': 'tex/ret_shotgun',
            'sniper': 'tex/ret_sniper'
        };

        let me = state.rx_state[state.me.team].players[state.me.id];

        gl.disable(gl.DEPTH_TEST);
        g.web.assets['mesh/plane'].using_shader('basic_textured')
        .with_attribute({name:'a_position', buffer:'positions', components: 3})
        .with_attribute({name:'a_tex_coord', buffer:'texture_coords', components: 2})
        .with_aspect_correct_2d(g.web.assets[ret_map[me.type]], [].scale(0.5))
        .draw_tri_fan();
        gl.enable(gl.DEPTH_TEST);
    }
};

g.web.draw(function (dt)
{
    t += dt;
    if (g.is_running == false) { return; }

    light.look_at([80, 140, -40], [0, 0, 0], [0, 1, 0]);
    shadow_map.bind_as_target();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    draw_scene(light.orthographic(180, 180), 'depth_only');
    shadow_map.unbind_as_target();

    gl.clearColor(140/255, 49/255, 26/255, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // draw_scene(light.orthographic(180, 180));
    draw_scene(state.me.cam.perspective(Math.PI / 2, 0.1, 3000));
});

