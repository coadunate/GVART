#!/usr/bin/perl

use strict;
use warnings;
use Data::Dumper;
use IPC::Open2;

# This script will take as input the Trinity.fasta file from a Trinity assembly:
#
# Trinity.fasta format:
#   >TR70|c0_g1_i1 len=274 path=[467:0-237 468:238-255 469:256-273] [-1, 467, 468, 469, -2]
#   CGTCGATCGCTTCTGGTATATCAACTCTTCTTCCTTGGATTTTTTTCCTTTTACCTATCA
#   TAAACAAAACACTAAAAGTCAGTAAAAGATAACTAATAAAACATAACTTTTTTTTTTCGA
#   TGAACAATATTCTGCTACAGTAATGCTGCTACAGTAACTCCCAGTTTTCTGCTACAGTGT
#   TAATCGATTTGTTTGCTAGTGTCGATCGATTTCTTTGCTACAGTTTTGATCGATGCTACA
#   GTTTTGATCGATGCTACAGTTTTGATCGATGCTA
#
# The contents of contig-ordering.txt will be stored in memory (hash %loci)
#   $TR_hash -> {TRnum} -> {"N"} -> {node_id} -> {"seq"} -> Node sequence
#                                             -> {"edges"} -> Connected node(s)
#                                             -> {"x"}
#                                             -> {"y"}
#                       -> {"I"} -> {iso_id} -> {"path"} -> path nodes
#                                            -> {"len"} -> length of trans
#                                            -> {"seq"} -> sequence

# if( $node_id !~ /^n\d+.*$/){ print "line " . $node_id; }
main();

sub main {

  my ($assembly) = @ARGV;

  my %TR_hash;
  #hash using node sequences as keys to determine repeating/identical nodes that could be combined
  my %node_seq_lookup;
  my %node_synonyms;
  my $last_TRnum;
  my $last_iso_id;

	open(TRLIST, "> data/TRLIST.js");
	print TRLIST "var trs = [";

  #PARSE THE CONTIG-ORDERING.txt FILE
  open(ASSEMBLY, "< $assembly") or die "Cannot open $assembly\n";

  # ----------------------- #
  # Redo for Trinity Output #
  # ----------------------- #
  while( <ASSEMBLY> ){

    chomp($_);
    #sometimes lines end with a path starting with -1, ending with -2
    #sometimes one or both of the -1/-2 are missing.
    if( $_ =~ /^>TR(\d+)\|(c\d+\_g\d+\_i\d+) len=(\d+) path=\[(.*)\] \[.*$/ ){
      my $tr = $1;
      my $iso = $2;
      my $len = $3;
      my $path_string = $4;

      if( defined $last_TRnum ){
        #Save sequence of nodes and the edges
        # ------------------------------------------------- #
        # copy this block to oustide the while loop as well #
        my $iso_path = $TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"};
        for(my $i = 0; $i <= $#{ $iso_path }; $i++){
          if( $iso_path->[$i] =~ /^@?(\d+)@?\!?\:(\d+)\-(\d+)$/ ){
            my $node_ID = "n" . $1;
            my $nodeSeq = substr($TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"seq"}, $2, $3-$2+1);
            $TR_hash{$last_TRnum}{"N"}{$node_ID}{"seq"} = $nodeSeq;
            #store node node id in hash with seq as key to find duplicate nodes
            $node_seq_lookup{$last_TRnum}{$nodeSeq}{$node_ID} = $last_TRnum;
            #print Dumper($i, $#{ $iso_path }, $iso_path);
            #print Dumper($TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"}[$i], $1);

            if( $i < $#{ $iso_path } ){
              my $src = $node_ID;
              my ($tgt) = ($iso_path->[$i+1] =~ /^@?(\d+)@?\!?\:.*$/);
              $tgt = "n" . $tgt;
              $TR_hash{$last_TRnum}{"N"}{$src}{"edges"}{$tgt} = "";
            }

            $TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"}[$i] = $node_ID;
          } else {
            print "Did not recognize: " . $iso_path->[$i] . "\n";
          }
        }
        # ------------------------------------------------- #
      }
      #print Dumper($1, $2, $3);
      $TR_hash{$tr}{"I"}{$iso}{"len"} = $len;
      $last_TRnum = $tr;
      $last_iso_id = $iso;
      my @path = split(" ", $path_string);
      $TR_hash{$tr}{"I"}{$iso}{"path"} = \@path;

    } elsif( $_ =~ /^([ATCG].*)$/ ){
      $TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"seq"} .= $1;
    } else {
      print "Unrecognized line format:\n" . $_ . "\n";
    }
  }
  #Save sequence of nodes and the edges
  # ------------------------------------------------- #
  # copy this block to oustide the while loop as well #
  my $iso_path = $TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"};
  for(my $i = 0; $i <= $#{ $iso_path }; $i++){
    if( $iso_path->[$i] =~ /^@?(\d+)@?\!?\:(\d+)\-(\d+)$/ ){
      my $node_ID = "n" . $1;
      my $nodeSeq = substr($TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"seq"}, $2, $3-$2+1);
      $TR_hash{$last_TRnum}{"N"}{$node_ID}{"seq"} = $nodeSeq;
      #store node node id in hash with seq as key to find duplicate nodes
      $node_seq_lookup{$last_TRnum}{$nodeSeq}{$node_ID} = $last_TRnum;
      #print Dumper($i, $#{ $iso_path }, $iso_path);
      #print Dumper($TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"}[$i], $1);

      if( $i < $#{ $iso_path } ){
        my $src = $node_ID;
        my ($tgt) = ($iso_path->[$i+1] =~ /^@?(\d+)@?\!?\:.*$/);
        $tgt = "n" . $tgt;
        $TR_hash{$last_TRnum}{"N"}{$src}{"edges"}{$tgt} = "";
      }

      $TR_hash{$last_TRnum}{"I"}{$last_iso_id}{"path"}[$i] = $node_ID;
    } else {
      print "Did not recognize: " . $iso_path->[$i] . "\n";
    }
  }
  # ------------------------------------------------- #
  close(ASSEMBLY);
  $last_TRnum = "";

  # ============================= #
  # Edit hash for repeating nodes #
  # ============================= #
  foreach my $TR (keys %node_seq_lookup){
    foreach my $node_seq (keys %{ $node_seq_lookup{$TR} }){
      my ($new_node_id, @repeat_nodes);
      foreach my $node_id (keys %{ $node_seq_lookup{$TR}{$node_seq} }){
        push(@repeat_nodes, $node_id);
      }
      my $combined_id = join("_", @repeat_nodes);
      foreach my $node_id (keys %{ $node_seq_lookup{$TR}{$node_seq} }){
        $node_synonyms{$TR}{$node_id} = $combined_id;
        if( $node_id !~ /^n\d+.*$/){ print "line 142: " . $node_id . "\n"; }
        $TR_hash{$TR}{"N"}{$combined_id} = $TR_hash{$TR}{"N"}{$node_id};
      }
    }
  }
  # find node pairs
  # create new node with joined ids and all ascociated edges
  # delete old nodes using delete $hash{key}

  #For each locus in %loci, run dot and capture output, then output as Locus_[$locus_id]_data.js file
  my $dot_string;

  #Generation of data file for each locus of the assembly O(L) L = number of loci in assembly
  foreach my $TRnum (keys %TR_hash){
    $dot_string = "digraph G {\n";
    $dot_string .= "\tsize=\"50,2\";\n\tratio=compress;\n\trankdir=LR;\n\n";

    #output nodes to dot file O(n) n = number of nodes for locus
    my %printed_nodes = ();
    foreach my $node_id (keys %{ $TR_hash{$TRnum}{"N"} }){
      #check if identical nodes have been combined with this one
      if( defined($node_synonyms{$TRnum}{$node_id}) ){
        $node_id = $node_synonyms{$TRnum}{$node_id};
      }
      if( exists($printed_nodes{$node_id})){
        #do not print again
      } else {
        $dot_string .= "\t" . $node_id . " [shape=rect width=2 height=0.1 label=\"" . $node_id . "\"];\n";
        $printed_nodes{$node_id} = "";
      }
    }
    #output edges to dot file O(n*e) n = number of nodes for locus, e = avg number of edges leaving each node
    foreach my $src_node (keys %{ $TR_hash{$TRnum}{"N"} }){
      foreach my $dest_node (keys %{ $TR_hash{$TRnum}{"N"}{$src_node}{"edges"} }){
        my $source = $src_node;
        my $destination = $dest_node;
        if( defined($node_synonyms{$TRnum}{$src_node}) ){
          $source = $node_synonyms{$TRnum}{$src_node};
        }
        if( defined($node_synonyms{$TRnum}{$dest_node}) ){
          $destination = $node_synonyms{$TRnum}{$dest_node};
        }

        $dot_string .= "\t\"" . $source . "\":e -> \"" . $destination . "\":w;\n";

        #Stuff to handle negative node output (not required for Trinity output)
        # if( $src_node < 0 ){
        #   $dot_string .= "\t" . $src_node . ":w -> ";
        # } else {
        #   $dot_string .= "\t" . $src_node . ":e -> ";
        # }
        # if( $dest_node < 0){
        #   $dot_string .= $dest_node . ":e\n";
        # } else {
        #   $dot_string .= $dest_node . ":w\n";
        #}
      }
    }
    $dot_string .= "}";
    #print Dumper(%node_synonyms);

    #print "*************************\n";
    #print "*** Input to GraphViz ***\n";
    #print "*************************\n";
    #print $dot_string;

    # ===================== #
    # GraphViz Graph Layout #
    # ===================== #
    #run dot (GraphViz) for the $out_string and capture result
    my $cmd = "dot";
    my $args = "-Tplain";
    my $pid = open2(\*READER, \*WRITER, $cmd, $args) or die "Error calling $cmd $args: $!";
    my $plain_graph = "";
    print WRITER $dot_string . "\n";
    close(WRITER) or die "Error closing STDIN to child proc: $!";
    #get output from dot (GraphViz)
    while( <READER> ){
      $plain_graph .= $_;
    }
    close(READER) or die "Error closing STDOUT to child proc: $!";
    wait();


    #print "***********************\n";
    #print "*** GraphViz Output ***\n";
    #print "***********************\n";
    #print $plain_graph;

    # Get the coordinates for nodes
    open my $pg, '<', \$plain_graph || die "Cannot open GraphViz output string: $!\n";
    my $graph_w = 0;
    my $graph_h = 0;
    while( <$pg> ){
      if( $_ =~ /^graph \d+\.?\d* (\d+\.?\d*) (\d+\.?\d*)$/ ){
        $graph_w = $1;
    		$graph_h = $2;
      } elsif( $_ =~ /^node (-?\d+) (\d+\.?\d*) (\d+\.?\d*) .* ellipse .*/ ){
        #do nothing for these lines
      } elsif( $_ =~ /^node (-?n\d+\S*) (\d+\.?\d*) (\d+\.?\d*)/ || $_ =~ /^node (-?\d+\_\d+.*) (\d+\.?\d*) (\d+\.?\d*)/){
    		#	1 -> node id
    		#	2 -> x pos
    		#	3 -> y pos

        #DOT output will contain combined nodes, so when printing JSOUT, have to check if
        # synonyms exists and look up coordinates for the node in each TR under the combined nodeID
    		$TR_hash{$TRnum}{"N"}{$1}{"x"} = $2;
    		$TR_hash{$TRnum}{"N"}{$1}{"y"} = $3;
    	} elsif( $_ =~ /^edge.*/ ){
        last;
      } else {
        next;
      }
    }
    close $pg or die "Cannot close the GraphViz output string: $!\n";

    # Create d3 Data File
    my $data_string = "";

    #D3 scales
    $data_string .= "var nodeX = d3.scale.linear();\n";
    $data_string .=  "\tnodeX.domain([0, " . $graph_w . "]);\n";
    $data_string .= "\tnodeX.range([0, " . $graph_w*70 . "]);\n";
    $data_string .= "var nodeY = d3.scale.linear();\n";
    $data_string .= "\tnodeY.domain([0, " . $graph_h . "]);\n";
    $data_string .= "\tnodeY.range([0, " . $graph_h*100 . "]);\n\n";

    #UNCOMMENT IF PROBLEMS
    #print Dumper(%TR_hash);
    #Nodes
    $data_string .= "var nodes = [\n";
    my %nodeIndices;          # need to store the indices of each node
    my $indexCounter = 0;     # for later use in building edges array
    my %printed = ();
    #print Dumper(%{ $TR_hash{$TRnum}{"N"} });
    foreach my $node_key (keys %{ $TR_hash{$TRnum}{"N"} }){
      #print Dumper($node_key, $TR_hash{$TRnum}{"N"}{$node_key});
      my $node_ID = $node_key;
      if( defined($node_synonyms{$TRnum}{$node_key}) ){
        $node_ID = $node_synonyms{$TRnum}{$node_key};
      }
      if( defined($printed{$node_ID}) ){
        next;
      }
      $nodeIndices{$node_ID} = $indexCounter;
      $indexCounter++;
      $data_string .= "\t{title: \"". $node_ID . "\"";
      (my $fixed_id = $node_ID) =~ s/^n(\d+).*$/$1/;
      print $fixed_id;
      $data_string .= ", id: " . $fixed_id . "";
      #ERRORS HERE!
      $data_string .= ", x: " . "nodeX(" . $TR_hash{$TRnum}{"N"}{$node_ID}{"x"} . ")";
      $data_string .= ", y: " . "nodeY(" . $TR_hash{$TRnum}{"N"}{$node_ID}{"y"} . ")";
      $data_string .= ", w: " . length($TR_hash{$TRnum}{"N"}{$node_ID}{"seq"});
      $data_string .= ", seq: \"" . $TR_hash{$TRnum}{"N"}{$node_ID}{"seq"} . "\"},\n";
      $printed{$node_ID} = "";
    }
    $data_string .= "\t];\n\n";

    #Edges
    $data_string .= "var edges = [\n";
    my %printed_edges = ();
    foreach my $source_node (keys %{ $TR_hash{$TRnum}{"N"} }){
      foreach my $target_node (keys %{ $TR_hash{$TRnum}{"N"}{$source_node}{"edges"} }){
        my $source_index;
        my $target_index;
        if( defined($node_synonyms{$TRnum}{$source_node})){
          $source_index = $nodeIndices{$node_synonyms{$TRnum}{$source_node}};
        } else {
          $source_index = $nodeIndices{$source_node};
        }

        if( defined($node_synonyms{$TRnum}{$target_node})){
          $target_index = $nodeIndices{$node_synonyms{$TRnum}{$target_node}};
        } else {
          $target_index = $nodeIndices{$target_node};
        }

        if( defined($printed_edges{$source_index}{$target_index}) ){
          next;
        } else {
          $data_string .= "\t\t{source: nodes[" . $source_index;
          $data_string .= "], target: nodes[" . $target_index;
          $data_string .= "]},\n";
          $printed_edges{$source_index}{$target_index} = "";
        }
      }
    }
    $data_string .= "\t];\n\n";

    #Transcripts
    $data_string .= "var transcripts = [\n";
    foreach my $trans (keys %{ $TR_hash{$TRnum}{"I"} }){
      $data_string .= "\t\t{name: \"" . $trans . "\"";
      $data_string .= ", length: " . $TR_hash{$TRnum}{"I"}{$trans}{"len"};
      my @path;
      foreach my $pathNode (keys @{ $TR_hash{$TRnum}{"I"}{$trans}{"path"} }){
        #print "hello" . @{ $TR_hash{$TRnum}{"I"}{$trans}{"path"} }[$pathNode] . "\n";
        #print Dumper($pathNode, @{ $TR_hash{$TRnum}{"I"}{$trans}{"path"} });
        my $node_id = @{ $TR_hash{$TRnum}{"I"}{$trans}{"path"} }[$pathNode];
        if( defined($node_synonyms{$TRnum}{$node_id})){
          (my $fixed_id = $node_synonyms{$TRnum}{$node_id}) =~ s/^n(\d+).*$/$1/;
          push(@path, $fixed_id);
        } else {
          (my $fixed_id = $node_id) =~ s/^n(\d+).*$/$1/;
          push(@path, $fixed_id);
        }
      }
      $data_string .= ", pathnodes: [\"" . join("\", \"", @path) . "\"]";

      # have to modify the site for this:
      #$data_string .= ", sequence: \"" . $TR_hash{$TRnum}{"I"}{$trans}{"seq"} . "\"";

      $data_string .= "},\n";
    }
    $data_string .= "\t];";

    #PRINT TO FILE:
    my $js_output = "TR" . $TRnum . "_data.js";
    open(JSOUT, "> $js_output") or die "Cannot open $js_output for writing\n";
    print JSOUT $data_string;
		print TRLIST "\"$js_output\", ";
    close(JSOUT);
  }
	print TRLIST "];";
  #Time Complexity: O(L*N*E)
  # L = number of loci in assembly (large ~50,000s)
  # N = average number of nodes per locus (medium ~1-200)
  # E = average number of edges outgoing from each node (small ~1-2)
}
