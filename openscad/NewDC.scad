// -----------------------------------------------------------
//  Minimal key-chain generator – **outline merged with text**
// -----------------------------------------------------------
//
//  This version hides the rectangular bar whenever line2 is
//  empty, yet preserves the lug and the bubbly outline.
// -----------------------------------------------------------


/* -----------------------------------------------------------
   User-editable text
   ---------------------------------------------------------*/
line1 = "Name";   // first (or only) line
line2 = "";       // add text here if you *do* want a bar
line3 = "";
line4 = "";
line5 = "";

/* -----------------------------------------------------------
   Global style
   ---------------------------------------------------------*/
ruler_unit        = 10;
character_spacing = 0.985;
line_spacing      = 1.12;

bar_style  = "surround_text";
lug_style  = "plate";

writing_direction = "ltr";
function is_vertical() = writing_direction == "btt" || writing_direction == "ttb" ? 90 : 0;

/* -----------------------------------------------------------
   Font
   ---------------------------------------------------------*/
font_name          = "Comfortaa";
font_size          = 20;
font_narrow_widen  = 0;
font_weight        = 15;
font_outline_width = 0.00001;
font_outline_style = "rounded";

/* -----------------------------------------------------------
   Lug
   ---------------------------------------------------------*/
lug_text_distance  = -1;
lug_length         = 4;
lug_width          = 3.5;
hole_extra_margin  = 0.00001;

/* -----------------------------------------------------------
   Bar / background plate
   ---------------------------------------------------------*/
// -- CHANGED: bar disappears if line2 is blank
function barlenfun() = len(line2) > 0 ? 35 : 17;   // ★

// keep the following values as before
bar_shift         = 0;
bar_width         = barlenfun();
bar_length_trim   = 0;

glyph_coalesce          = 25;
glyph_coalesce_strategy = "bar and glyphs";

/* -----------------------------------------------------------
   Border (optional – kept off)
   -----------------------------------------------------------*/
border_width       = 0;
inner_margin_width = 1.4;
outer_margin_width = 1.0;

/* -----------------------------------------------------------
   Layer heights
   ---------------------------------------------------------*/
bar_thickness     = 3.1;
outline_thickness = bar_thickness + 0.8;
text_thickness    = bar_thickness + 1.6;
border_thickness  = text_thickness;

/* -----------------------------------------------------------
   Preview colours
   ---------------------------------------------------------*/
bar_color  = "Khaki";
text_color = "DarkRed";
outline_color = text_color;
border_color  = "Black";

/* -----------------------------------------------------------
   Extruder assignment
   ---------------------------------------------------------*/
which_extruder    = "monochrome_";
bar_extruder      = "extruder1_";
text_extruder     = "extruder2_";
outline_extruder  = text_extruder;
border_extruder   = text_extruder;
function monochrome_part() = "monochrome_";
minimal_color_layer_thickness = 0.6;

/* -----------------------------------------------------------
   Internal constants
   ---------------------------------------------------------*/
$fn = 50;
fonts = [["Comfortaa", ["Light", "Regular", "Bold"]]];
default_font_style = "Regular";
fonts_with_style = [
    ["", "Comfortaa", default_font_style],
    ["Comfortaa (Regular)", "Comfortaa", "Regular"],
    ["Comfortaa (Light)",   "Comfortaa", "Light"],
    ["Comfortaa (Bold)",    "Comfortaa", "Bold"]
];
font_string = str(font_name, ":style=", default_font_style);

offset_delta_workaround = false;
extra_weight = 0;
text_vshift  = 3 * (is_vertical() ? 1 : -1);

text_to_write = (line5 != "" ? [line1,line2,line3,line4,line5] :
                 (line4 != "" ? [line1,line2,line3,line4]      :
                 (line3 != "" ? [line1,line2,line3]            :
                 (line2 != "" ? [line1,line2]                  :
                 (line1 != "" ? [line1]                        : [""])))));

final_bar_width = bar_width > 0 ? max(bar_width,
    lug_width + 2 * outer_margin_width + 2 * inner_margin_width +
    2 * border_width + font_size * line_spacing * (len(text_to_write) - 1)) : 0;

font_narrow_widen_factor = 1 + font_narrow_widen/100;
core_bar_width = max(0.01, final_bar_width - 2*min(lug_length,lug_width)/2
                     - 2*inner_margin_width - 2*outer_margin_width - 2*border_width);

max_thickness = max(bar_thickness, outline_thickness, text_thickness);

// -- CHANGED: lug survives even when bar_width is zero
has_lug      = (lug_length > 0 && lug_width > 0);   // ★

lug_radius   = min(lug_length, lug_width) / 2;
lug_x_offset = lug_length/2 - lug_radius;
lug_y_offset = lug_width/2  - lug_radius;

final_bar_shift       = bar_shift * font_size / 60;
final_bar_length_trim = bar_length_trim * font_size / 60
                        - (bar_style == "surround_text" ? hole_extra_margin : 0);

// -----------------------------------------------------------
// Build it!
// -----------------------------------------------------------
rotate([0,0,is_vertical() ? -90 : 0]) make_keychain();


// =====   Modules   =========================================
module make_keychain() {
    difference() {
        extrude_layers(get_heights(), get_extruders(), get_colors()) {
            plate(inner_margin_width + outer_margin_width + border_width);
            if (border_width > 0) border_layer();
            outline_write_text(font_outline_width);
            write_text();
        }
        if (has_lug) {
            translate([-lug_length - lug_x_offset, 0, -0.1])
                cylinder(h = max_thickness + 0.2,
                         r = lug_radius - hole_extra_margin, $fn = 60);
        }
    }
}

function get_extruders() = [bar_extruder, border_extruder,
                            outline_extruder, text_extruder];
function get_colors()    = [bar_color,  border_color,
                            outline_color,  text_color];
function get_heights()   = [[0,bar_thickness],
                            [bar_thickness,border_thickness],
                            [bar_thickness,outline_thickness],
                            [outline_thickness,text_thickness]];

module plate(s) {
    glyph_coalesce(s);
    bar_plate(s);
    outline_write_text((bar_style == "surround_text" ? s : 0)
                        + font_outline_width);
}

module border_layer() {
    if (bar_style == "surround_text") {
        difference() {
            plate(inner_margin_width + border_width);
            plate(inner_margin_width);
        }
    } else {
        difference() {
            bar_plate(inner_margin_width + border_width);
            bar_plate(inner_margin_width);
        }
    }
}

module glyph_coalesce(s) {
    if (glyph_coalesce > 0 && glyph_coalesce_strategy != "off")
        assign(d = font_size/300 * glyph_coalesce)
            offset(delta = -d-.01)
                offset(delta = d, chamfer = true) union() {
                    if (glyph_coalesce_strategy == "bar and glyphs")
                        bar_plate(s);
                    outline_write_text(font_outline_width);
                }
}

module outline_write_text(d) {
    if (font_outline_width > 0)
        offset(r = font_outline_style == "rounded" ? d : [],
               delta = font_outline_style != "rounded" ? d : [],
               chamfer = font_outline_style == "chamfer",
               $fn = 15)
            write_text();
    else write_text();
}

module write_text() {
    offset(delta = font_size/500 * (font_weight + extra_weight),
           chamfer = offset_delta_workaround)
        translate([lug_text_distance, font_size/8 * text_vshift])
            rotate([0,0,is_vertical() ? 90 : 0])
                scale([font_narrow_widen_factor,1,1])
                    for (n = [0 : len(text_to_write)-1])
                        translate([0, font_size*line_spacing
                                   *((len(text_to_write)-1)/2 - n)])
                            text(str(text_to_write[n]),
                                 font_size, font_string,
                                 direction = writing_direction,
                                 halign = is_vertical() ? "center" : "left",
                                 valign = "baseline",
                                 spacing = character_spacing, $fn = 50);
}

module bar_plate(s) if (final_bar_width > 0)
    translate([0, final_bar_shift])
        offset(r = lug_radius + s + hole_extra_margin, $fn = 30)
            core_bar();

module core_bar() union() {
    hull() union() {
        intersection() {
            translate([0, -core_bar_width/2])
                square([1000, core_bar_width]);
            hull() for (y = [-1000, 1000])
                translate([final_bar_length_trim - font_size/6, y])
                    write_text();
        }
        translate([0, -core_bar_width/2])
            square([0.1, core_bar_width]);
    }
    if (has_lug) {
        if (lug_style == "plate") {
            translate([-lug_length - lug_x_offset, -lug_width/2 - lug_y_offset])
                square([lug_length, lug_width]);
            translate([-lug_length - lug_x_offset, 0])
                circle(r = lug_radius, $fn = 60);
        } else if (lug_style == "pointy") {
            translate([-lug_length/2 - lug_x_offset, -lug_width/2 - lug_y_offset])
                square([lug_length, lug_width]);
        }
    }
}

module extrude_layers(heights=[[0,1]], extruders=[], colors=[]) {
    union() {
        layer_count = min(len(heights), $children);
        for (i = [0 : layer_count-1]) {
            h = heights[i];
            translate([0,0,h[0]])
                color(len(colors) > i ? colors[i] : undef)
                    linear_extrude(height = h[1] - h[0])
                        child(i);
        }
    }
}

// End of file
