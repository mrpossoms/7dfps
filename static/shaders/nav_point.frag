uniform lowp vec4 u_color;

void main (void)
{
    lowp vec2 uv = gl_PointCoord - vec2(0.5);
    // if (dot(uv, uv) > 0.25) discard;
    gl_FragColor = u_color;// * vec4(1.0, 1.0, 1.0, 0.1 / dot(uv, uv));
}
