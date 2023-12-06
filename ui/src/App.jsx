import { useEffect, useRef, useState } from 'react'
import './App.css'
import axios from 'axios';
import { Box, Button, Container, Grid, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

function App() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [refresh, setRefresh] = useState(false);

  const getFiles = async () => {
    const response = await axios.get('http://localhost:1901/getFiles');
    setFiles(response.data.files);
  }
  useEffect(() => {
    getFiles();
  }, [refresh])

  const getLocalClient = (extension) => {
    let excelRegex = new RegExp('^(csv|ods|xls|xls[b,x,m])$');
    let wordRegex = new RegExp('^(doc|doc[m|x]|dot|dot[m,x]|odt|rtf)$');
    let powerpointRegex = new RegExp('^(odp|pot|pot[|m|x]|pps|pps[m,x]|ppt|ppt[m,x])$');
    let visioRegex = new RegExp('^(one|onetoc2)$');

    if (excelRegex.test(extension.toLowerCase())) {
      return 'ms-excel';
    }

    if (wordRegex.test(extension.toLowerCase())) {
      return 'ms-word';
    }

    if (powerpointRegex.test(extension.toLowerCase())) {
      return 'ms-powerpoint';
    }

    if (visioRegex.test(extension.toLowerCase())) {
      return 'ms-visio';
    }
  };

  const onOpen = (id, extension) => {
    const webDavUrl = `${getLocalClient(extension)}:ofe|u|http://localhost:1901/webdav/${id}/latest/document.${extension}`
    window.open(webDavUrl);
  }

  const onSelectFileButtonCLick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0]
    const signedUrlResponse = await axios.post('http://localhost:1901/getSignedUrl', {
      filename: selectedFile.name,
      type: selectedFile.type
    })
    const formData = new FormData();
    formData.append('file', selectedFile);
    const signedUrl = signedUrlResponse.data.signedUrl;
    const response = await axios.put(signedUrl, selectedFile, {
      headers: {
        'Content-Type': selectedFile.type
      },
      onUploadProgress: (event) => {
        setUploadProgress(Math.round(event.loaded * 100) / event.total)
      }
    })
    if (response.status === 200) {
      setUploadProgress(0)
      setRefresh(!refresh)
    }
  }

  return (
    <Container>
      <Grid container>
        <Grid item xs={12} style={{ textAlign: 'right', margin: 5 }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
          <Button variant='contained' color='success' onClick={onSelectFileButtonCLick}>Upload</Button>
        </Grid>
        <Grid item xs={12} style={{ margin: 5 }}>
          {uploadProgress > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', color: 'white' }}>
              <Box sx={{ width: '100%', mr: 1 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
              </Box>
              <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" color="InfoText">{`${Math.round(uploadProgress)}%`}</Typography>
              </Box>
            </Box>
          )}
        </Grid>
      </Grid>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell>File ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Last updated</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {files.map((row) => (
              <TableRow key={row.documentId}>
                <TableCell component="th" scope='row'>
                  {row.documentId.slice(0, 8)}
                </TableCell>
                <TableCell>
                  {row.title}
                </TableCell>
                <TableCell>
                  {row.extension}
                </TableCell>
                <TableCell>
                  {new Date(row.updatedOn).toDateString()}
                </TableCell>
                <TableCell>
                  <Button variant='contained' color='primary' onClick={() => onOpen(row.documentId, row.extension)}>Open</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  )
}

export default App
