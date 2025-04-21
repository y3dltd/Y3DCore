/*
 * Copyright 2021-2023 Code and Make (codeandmake.com)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*
 * Personalised Number Plate Keyring by Code and Make (https://codeandmake.com/)
 *
 * https://codeandmake.com/post/personalised-number-plate-keyring
 *
 * Personalised Number Plate Keyring v1.3 (6 December 2023)
 */

/*
 * To use this project, you will require the Mandatory font by K-Type, which is 'free for personal use':
 *
 * https://www.k-type.com/fonts/mandatory/
 *
 * Please see the K-Type Licences page for details:
 *
 * https://www.k-type.com/licences/
 */

/* [Text] */

// The text
Text = "ABC 123";

// Should text be inset?
Inset_Text = 0; // [0: No, 1: Yes]

// Thickness of the text
Text_Thickness = 1.0; // [0.1:0.1:5]

/* [Plate] */

// Width of the plate (excluding border)
Plate_Width = 60; // [30:1:100]

// Width of the border
Border_Width = 1.0; // [0:0.1:5]

// Thickness of the plate
Plate_Thickness = 2.0; // [0.1:0.1:5]

// Additional material thickness of border
Additional_Border_Thickness = 0; // [0:0.1:5]

/* [Keyring] */

// Should a keyring hole be added?
Keyring_Hole = 1; // [0: No, 1: Yes]

// Diameter of the hole
Hole_Diameter = 8.0; // [0.1:0.1:15]

// Thickness of the material around the hole
Hole_Border_Width = 2;  // [0.5:0.1:5]

/* [Other] */

// Add a priming block (for multi-filament prints)
Priming_Block = 0; // [0:No, 1:Yes]

// Diameter of the priming block
Priming_Block_Diameter_Percent = 100; // [10:1:100]

// Priming block X offset as percentage of distance from center
Priming_Block_X_Offset_Percent = 0; // [-100:1:100]

// Priming block Y offset as percentage of distance from center
Priming_Block_Y_Offset_Percent = -100; // [-100:1:100]


use <Mandatory.otf>

module numberPlateKeyring() {
  fontName = "Mandatory";
  $fn = 100;

  fullsizePlateWidth = 520;
  fullsizePlateHeight = 111;
  fullsizeFontHeight = 69;
  fullSizePlateCornerRadius = 5;

  scale = Plate_Width / fullsizePlateWidth;

  // scale up to full size
  fullSizeBorderWidth = Border_Width / scale;
  fullSizeHoleDiameter = Hole_Diameter / scale;
  fullSizeHoleBorderWidth = Hole_Border_Width / scale;

  keyringHoleXOffset = (fullsizePlateWidth / 2) + fullSizeBorderWidth + max((fullSizeHoleDiameter / 2), fullsizePlateHeight / 2);

  primingBlockDiameter = (fullsizePlateHeight + (fullSizeBorderWidth * 2)) * (Priming_Block_Diameter_Percent / 100);
  primingBlockMaterialHeight = Plate_Thickness + (Inset_Text ? max(Text_Thickness, Additional_Border_Thickness) : Text_Thickness + Additional_Border_Thickness);
  primingBlockXOffset = (keyringHoleXOffset + (fullSizeHoleDiameter / 2) + fullSizeHoleBorderWidth + (primingBlockDiameter / 2) + (fullsizePlateHeight / 2)) * (Priming_Block_X_Offset_Percent / 100);
  primingBlockYOffset = (((fullsizePlateHeight * 1.5) + (fullSizeBorderWidth * 2) + primingBlockDiameter) / 2) * (Priming_Block_Y_Offset_Percent / 100);

  module plate(width, height, thickness, radius) {
    translate([-width / 2, -height / 2, -thickness]) {
      translate([radius, radius, 0]) {
        minkowski() {
          cube([width - (radius * 2), height - (radius * 2), (radius ? thickness / 2 : thickness)]);
          cylinder(r = radius, h = thickness / 2);
        }
      }
    }
  }

  module border() {
    if (Border_Width) {
      if (Inset_Text) {
        translate([0, 0, Additional_Border_Thickness]) {
          difference() {
            plate(fullsizePlateWidth + (fullSizeBorderWidth * 2), fullsizePlateHeight + (fullSizeBorderWidth * 2), Plate_Thickness + Additional_Border_Thickness, fullSizePlateCornerRadius + fullSizeBorderWidth);
            translate([0, 0, 0.5]) {
              plate(fullsizePlateWidth, fullsizePlateHeight, Plate_Thickness + Additional_Border_Thickness + 1, fullSizePlateCornerRadius);
            }
          }
        }
      } else {
        translate([0, 0, Text_Thickness + Additional_Border_Thickness]) {
          difference() {
            plate(fullsizePlateWidth + (fullSizeBorderWidth * 2), fullsizePlateHeight + (fullSizeBorderWidth * 2), Plate_Thickness + Text_Thickness + Additional_Border_Thickness, fullSizePlateCornerRadius + fullSizeBorderWidth);
            translate([0, 0, 0.5]) {
              plate(fullsizePlateWidth, fullsizePlateHeight, Plate_Thickness + Text_Thickness + Additional_Border_Thickness + 1, fullSizePlateCornerRadius);
            }
          }
        }
      }
    }
  }

  scale([scale, scale, 1]) {
    if (Inset_Text) {
      color("black") {
        translate([0, 0, 0.05]) {
          plate(fullsizePlateWidth, fullsizePlateHeight, Plate_Thickness, fullSizePlateCornerRadius);
        }
      }

      color("white") {
        difference() {
          translate([0, 0, Text_Thickness]) {
            plate(fullsizePlateWidth, fullsizePlateHeight, Text_Thickness, fullSizePlateCornerRadius);
          }
          translate([0, 0, -0.5]) {
            linear_extrude(height = Text_Thickness + 1) {
              text(Text, font = fontName, valign = "center", halign = "center", size = fullsizeFontHeight);
            }
          }
        }
      }
    } else {
      color("white") {
        plate(fullsizePlateWidth, fullsizePlateHeight, Plate_Thickness, fullSizePlateCornerRadius);
      }

      color("black") {
        intersection() {
          translate([0, 0, Text_Thickness]) {
            plate(fullsizePlateWidth, fullsizePlateHeight, Text_Thickness + 1, fullSizePlateCornerRadius);
          }
          linear_extrude(height = Text_Thickness) {
            text(Text, font = fontName, valign = "center", halign = "center", size = 61); // SIZE
          }
        }
      }
    }

    // border
    color("black") {
      border();
    }

    // keyring hole
    if (Keyring_Hole) {
      height = (Border_Width ? (Inset_Text ? Plate_Thickness : Plate_Thickness + Text_Thickness) : (!Inset_Text ? Plate_Thickness : Plate_Thickness + Text_Thickness));

      color((Border_Width ? "black" : "white")) {
        difference() {
          hull() {
            // plate attachment
            hull() {
              // top corner
              translate([(fullsizePlateWidth / 2) - fullSizePlateCornerRadius, (fullsizePlateHeight / 2) - fullSizePlateCornerRadius, -Plate_Thickness]) {
                cylinder(r = fullSizePlateCornerRadius + fullSizeBorderWidth, h = height);
              }

              // bottom corner
              translate([(fullsizePlateWidth / 2) - fullSizePlateCornerRadius, -(fullsizePlateHeight / 2) + fullSizePlateCornerRadius, -Plate_Thickness]) {
                cylinder(r = fullSizePlateCornerRadius + fullSizeBorderWidth, h = height);
              }
            }

            translate([keyringHoleXOffset, 0, (height / 2) -Plate_Thickness]) {
              difference() {
                cylinder(d = fullSizeHoleDiameter + (fullSizeHoleBorderWidth * 2), h = height, center = true);
              }
            }
          }

          // hole
          translate([keyringHoleXOffset, 0, (height / 2) -Plate_Thickness]) {
            cylinder(d = fullSizeHoleDiameter, h = height + 1, center = true);
          }

          translate([0, 0, Text_Thickness + 1]) {
            plate(fullsizePlateWidth, fullsizePlateHeight, Plate_Thickness + Text_Thickness + 1, fullSizePlateCornerRadius);
          }
        }
      }
    }

    if(Priming_Block) {
      translate([primingBlockXOffset, primingBlockYOffset, -Plate_Thickness]) {
        cylinder(d = primingBlockDiameter, h = primingBlockMaterialHeight);
      }
    }
  }
}

numberPlateKeyring();

